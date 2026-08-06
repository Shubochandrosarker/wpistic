/**
 * Scheduled work for a self-hosted deployment — the replacement for Cloudflare
 * Cron Triggers.
 *
 * A single process running four jobs on a timer:
 *
 *  1. **Outbox drain** — publish committed domain events to their handlers.
 *     Identical code path to the Workers consumer, so both deployments run the
 *     same handlers.
 *  2. **License expiry reconciliation** — move lapsed licenses out of `active`
 *     and emit `license.expired`.
 *  3. **KV sweep** — reclaim expired rows. Correctness never depends on this;
 *     reads already filter on `expires_at`.
 *  4. **Rate-limit sweep** — reclaim finished windows.
 *
 * Jobs are serialized rather than run concurrently. On one VPS the database is
 * the scarce resource, and none of this is latency-sensitive.
 *
 * Run exactly one of these. Two schedulers would not corrupt anything — the
 * outbox uses `FOR UPDATE SKIP LOCKED` and the expiry sweep is idempotent via
 * `expiry_notified_at` — but they would compete for the same rows for no gain.
 */
import type { Sql } from 'postgres';
import { createSql, sweepExpiredKeys, sweepRateLimitCounters } from '@wpistic/node-runtime';
import { publishOutboxBatch } from './events/outbox.ts';
import { handleQueueBatch } from './events/handlers.ts';
import { buildApiEnv } from '@wpistic/node-runtime';
import { createExecutionContext } from '@wpistic/node-runtime';
import type { EventEnvelope } from '@wpistic/types';
import type { Env } from './env.ts';

const TICK_MS = Number(process.env.SCHEDULER_INTERVAL_MS ?? '60000');
const SWEEP_EVERY_TICKS = 60; // hourly at the default interval

function log(message: string, extra: Record<string, unknown> = {}): void {
  console.log(JSON.stringify({ level: 'info', message, ...extra, time: new Date().toISOString() }));
}

function logError(message: string, error: unknown): void {
  console.error(
    JSON.stringify({
      level: 'error',
      message,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      time: new Date().toISOString(),
    })
  );
}

/**
 * Reconcile licenses whose grace period has fully elapsed.
 *
 * Enforcement never depended on this — `evaluateLicenseLifecycle` computes the
 * effective state on every read — but the stored `status` column stayed
 * `active` forever, so admin counts treated expired licenses as live and the
 * status filter could never match one. `license.expired` also had a handler and
 * customer notification copy with no emitter anywhere, so nobody was ever told.
 *
 * `expiry_notified_at` makes this idempotent: a restart mid-batch, or an
 * accidental second scheduler, cannot notify the same customer twice.
 */
async function reconcileExpiredLicenses(sql: Sql): Promise<number> {
  const expired = await sql<Array<{ id: string; organization_id: string }>>`
    UPDATE licenses SET status = 'expired', expiry_notified_at = NOW()
    WHERE status = 'active'
      AND expires_at IS NOT NULL
      AND expires_at < NOW()
      -- Only once the pinned grace deadline has also passed. A license inside
      -- its grace period is still usable and must not be marked expired.
      AND (grace_period_ends_at IS NULL OR grace_period_ends_at < NOW())
      AND expiry_notified_at IS NULL
    RETURNING id, organization_id`;

  for (const license of expired) {
    // Through the outbox, not a direct call: the notification then inherits the
    // same retry and dead-letter behaviour as every other domain event.
    await sql`
      INSERT INTO event_outbox (event_type, payload, organization_id)
      VALUES ('license.expired',
              ${sql.json({ data: { license_id: license.id, org_id: license.organization_id } } as never)},
              ${license.organization_id})`;
  }
  return expired.length;
}

async function main(): Promise<void> {
  const sql = createSql();
  const env = buildApiEnv(sql) as unknown as Env;
  const ctx = createExecutionContext((error) => logError('background task failed', error));

  await sql`SELECT 1`;
  log('scheduler started', { interval_ms: TICK_MS });

  let ticks = 0;
  let stopping = false;

  const tick = async (): Promise<void> => {
    ticks += 1;

    // ---- 1. Outbox ---------------------------------------------------------
    try {
      const collected: EventEnvelope[] = [];
      const result = await publishOutboxBatch(
        sql,
        // A queue shim that collects rather than enqueues: on Workers this
        // hands off to the managed queue, but here the same process runs the
        // handlers, so events are gathered and dispatched below.
        {
          send: async (message: unknown) => {
            collected.push(message as EventEnvelope);
          },
          sendBatch: async (messages: Array<{ body: unknown }>) => {
            for (const m of messages) collected.push(m.body as EventEnvelope);
          },
        } as unknown as Queue,
        (row) => logError('outbox event exhausted retries', new Error(`${row.eventType}: ${row.error}`))
      );

      if (collected.length > 0) {
        await handleQueueBatch(
          {
            messages: collected.map((body, index) => ({
              id: `sched-${Date.now()}-${index}`,
              timestamp: new Date(),
              body,
              attempts: 1,
              ack: () => undefined,
              retry: () => undefined,
            })),
            queue: 'wpistic-events',
            ackAll: () => undefined,
            retryAll: () => undefined,
          } as unknown as MessageBatch<EventEnvelope>,
          env,
          ctx as unknown as ExecutionContext
        );
      }
      if (result.published || result.retried || result.exhausted) {
        log('outbox cycle', { ...result, dispatched: collected.length });
      }
    } catch (error) {
      logError('outbox cycle failed', error);
    }

    // ---- 2. License expiry -------------------------------------------------
    try {
      const count = await reconcileExpiredLicenses(sql);
      if (count > 0) log('licenses reconciled to expired', { count });
    } catch (error) {
      logError('license expiry reconciliation failed', error);
    }

    // ---- 3 + 4. Housekeeping ----------------------------------------------
    if (ticks % SWEEP_EVERY_TICKS === 0) {
      try {
        const keys = await sweepExpiredKeys(sql);
        const windows = await sweepRateLimitCounters(sql);
        log('housekeeping sweep', { expired_keys: keys, rate_limit_windows: windows });
      } catch (error) {
        logError('housekeeping sweep failed', error);
      }
    }
  };

  const loop = async (): Promise<void> => {
    while (!stopping) {
      const startedAt = Date.now();
      await tick();
      // Sleep the remainder of the interval, so a slow tick does not stack the
      // next one on top of it.
      const remaining = Math.max(0, TICK_MS - (Date.now() - startedAt));
      await new Promise((resolve) => setTimeout(resolve, remaining));
    }
  };

  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.on(signal, () => {
      void (async () => {
        stopping = true;
        log('scheduler stopping');
        await ctx.drain();
        await sql.end({ timeout: 5 }).catch(() => undefined);
        process.exit(0);
      })();
    });
  }

  await loop();
}

await main();

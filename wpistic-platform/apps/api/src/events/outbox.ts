/**
 * Transactional outbox (spec 7): critical mutations (license activate,
 * deactivate, billing webhook effects) write their event into
 * `event_outbox` inside the SAME database transaction as the business
 * mutation, instead of calling EventBus.publish directly. A queue send can
 * fail independently of the mutation — writing both atomically means the
 * event is never silently lost even when EventBus.publish would have
 * swallowed the error.
 *
 * A Worker Cron Trigger (see index.ts `scheduled`, wrangler.jsonc `crons`)
 * runs `publishOutboxBatch` every minute to drain unprocessed rows onto the
 * real Cloudflare Queue.
 */
import type { Sql, TransactionSql } from 'postgres';
import type { DomainEvent, DomainEventType, EventEnvelope } from '@wpistic/types';

export async function writeOutboxEvent<T extends DomainEvent>(
  tx: TransactionSql,
  type: T['type'],
  data: T['data'],
  organizationId: string | null
): Promise<void> {
  await tx`
    INSERT INTO event_outbox (event_type, payload, organization_id)
    VALUES (${type}, ${tx.json({ data } as never)}, ${organizationId})`;
}

const OUTBOX_BATCH_SIZE = 50;

export interface OutboxPublishResult {
  published: number;
  retried: number;
  exhausted: number;
}

/**
 * Drain unprocessed outbox rows onto the real queue. Idempotent to re-run —
 * already-processed rows are excluded.
 *
 * The batch is selected with FOR UPDATE SKIP LOCKED inside a transaction
 * that stays open until every row's outcome (processed/attempted) is
 * recorded, so overlapping cron invocations skip each other's rows instead
 * of double-publishing them. The envelope id is derived from the outbox row
 * id — stable across retries — so downstream consumers can deduplicate the
 * rare redelivery (e.g. a crash between queue.send and commit).
 */
export async function publishOutboxBatch(
  sql: Sql,
  queue: Queue,
  onExhausted: (row: { id: string; eventType: string; error: string }) => void
): Promise<OutboxPublishResult> {
  return sql.begin(async (tx) => {
    const rows = await tx<
      Array<{
        id: string;
        event_type: string;
        payload: { data: unknown };
        attempts: number;
        max_attempts: number;
        created_at: string;
      }>
    >`
      SELECT id, event_type, payload, attempts, max_attempts, created_at
      FROM event_outbox
      WHERE processed_at IS NULL AND attempts < max_attempts
      ORDER BY created_at ASC
      LIMIT ${OUTBOX_BATCH_SIZE}
      FOR UPDATE SKIP LOCKED`;

    const result: OutboxPublishResult = { published: 0, retried: 0, exhausted: 0 };

    for (const row of rows) {
      const envelope: EventEnvelope = {
        id: `evt_${row.id.replace(/-/g, '')}`,
        type: row.event_type as DomainEventType,
        occurred_at: new Date(row.created_at).toISOString(),
        correlation_id: null,
        data: row.payload.data as never,
      };

      try {
        await queue.send(envelope, { contentType: 'json' });
        await tx`UPDATE event_outbox SET processed_at = NOW(), attempts = attempts + 1 WHERE id = ${row.id}`;
        result.published++;
      } catch (err) {
        const attempts = row.attempts + 1;
        const errorMessage = String(err);
        await tx`UPDATE event_outbox SET attempts = ${attempts}, error = ${errorMessage} WHERE id = ${row.id}`;
        if (attempts >= row.max_attempts) {
          result.exhausted++;
          onExhausted({ id: row.id, eventType: row.event_type, error: errorMessage });
        } else {
          result.retried++;
        }
      }
    }

    return result;
  }) as Promise<OutboxPublishResult>;
}

/**
 * Queue consumer: reacts to domain events — entitlement cache invalidation,
 * in-app notifications, and signed webhook fan-out to product apps.
 *
 * Hardening (spec 7.3):
 *  - Deduplicated by event ID: a redelivered message never re-runs the
 *    business side-effects (notification inserts, etc.) a second time,
 *    though webhook delivery retries for that same message still proceed.
 *  - Per-subscription webhook retry with an immediate/5min/15min schedule,
 *    tracked in KV (`webhook_retry:{event_id}:{subscription_id}`). After
 *    the schedule is exhausted the subscription is suspended and its
 *    organization (or, for a platform-wide subscription, the platform log)
 *    is notified.
 */
import type { Sql } from 'postgres';
import type { EventEnvelope, OrgRole } from '@wpistic/types';
import type { Env } from '../env';
import { createDb } from '../db';
import { hmacSha256Hex } from '../utils/crypto';

const LOW_CREDIT_THRESHOLD = 50;
const PROCESSED_EVENT_TTL_SECONDS = 86400;
const WEBHOOK_STATE_TTL_SECONDS = 86400;
/** Seconds to wait before the Nth retry (1-indexed): immediate → 5 min → 15 min, then give up. */
const WEBHOOK_RETRY_SCHEDULE_SECONDS = [300, 900];

export async function handleQueueBatch(batch: MessageBatch<EventEnvelope>, env: Env, ctx: ExecutionContext): Promise<void> {
  const sql = createDb(env);
  try {
    await processBatch(batch.messages, sql, env);
  } finally {
    ctx.waitUntil(sql.end({ timeout: 5 }));
  }
}

/** The per-message loop, `sql`-injected for testability — `handleQueueBatch` owns the connection lifecycle. */
export async function processBatch(
  messages: ReadonlyArray<Message<EventEnvelope>>,
  sql: Sql,
  env: Env
): Promise<void> {
  for (const message of messages) {
    try {
      const outcome = await handleEvent(message.body, sql, env);
      if (outcome?.retryAfterSeconds) {
        message.retry({ delaySeconds: outcome.retryAfterSeconds });
      } else {
        message.ack();
      }
    } catch (err) {
      console.error(
        JSON.stringify({
          level: 'error',
          message: 'event handling failed',
          type: message.body?.type,
          attempt: message.attempts,
          error: String(err),
        })
      );
      message.retry({ delaySeconds: Math.min(600, 30 * 2 ** (message.attempts - 1)) });
    }
  }
}

interface HandleEventOutcome {
  retryAfterSeconds?: number;
}

async function handleEvent(event: EventEnvelope, sql: Sql, env: Env): Promise<HandleEventOutcome | void> {
  const dedupeKey = `processed_event:${event.id}`;
  const alreadyProcessed = await env.SESSION_CACHE.get(dedupeKey);

  if (!alreadyProcessed) {
    await applySideEffects(event, sql);
    await env.SESSION_CACHE.put(dedupeKey, '1', { expirationTtl: PROCESSED_EVENT_TTL_SECONDS });
  }

  // Webhook fan-out has its own per-subscription retry/dedupe and always
  // runs, even on a redelivery whose business side-effects already landed —
  // a prior attempt may have failed to reach some subscribers but not others.
  return fanOutWebhooks(event, sql, env);
}

async function applySideEffects(event: EventEnvelope, sql: Sql): Promise<void> {
  const data = event.data as Record<string, unknown>;
  const orgId = (data.org_id as string | undefined) ?? null;

  switch (event.type) {
    case 'entitlements.changed':
      // Cache invalidation is handled by EntitlementService.invalidate() at
      // the point of mutation; nothing further to do here.
      break;

    case 'ai_credits.consumed': {
      const balance = data.balance_after as number;
      if (orgId && balance <= LOW_CREDIT_THRESHOLD) {
        await notifyOrgRoles(sql, orgId, ['owner', 'admin', 'billing_manager'], {
          type: 'ai_credits.low_balance',
          severity: 'warning',
          title: 'AI credits running low',
          body: `Your organization has ${balance} AI credits remaining. Top up to avoid interruptions.`,
          action_url: '/billing',
        });
      }
      break;
    }

    case 'subscription.past_due':
      if (orgId) {
        await notifyOrgRoles(sql, orgId, ['owner', 'admin', 'billing_manager'], {
          type: 'billing.past_due',
          severity: 'critical',
          title: 'Payment failed',
          body: 'Your latest payment failed. Update your payment method to keep your products active.',
          action_url: '/billing',
        });
      }
      break;

    case 'subscription.cancelled':
      if (orgId) {
        await notifyOrgRoles(sql, orgId, ['owner', 'admin', 'billing_manager'], {
          type: 'billing.cancelled',
          severity: 'warning',
          title: 'Subscription cancelled',
          body: 'Your subscription has been cancelled. Access continues until the end of the paid period.',
          action_url: '/billing',
        });
      }
      break;

    case 'license.expired':
      if (orgId) {
        await notifyOrgRoles(sql, orgId, ['owner', 'admin', 'product_manager'], {
          type: 'license.expired',
          severity: 'warning',
          title: 'License expired',
          body: 'A license in your organization has expired. Renew to keep receiving updates.',
          action_url: '/licenses',
        });
      }
      break;

    case 'support.ticket.created':
      // Internal routing hook — staff-side alerting lands in the admin portal.
      break;

    default:
      break;
  }
}

async function notifyOrgRoles(
  sql: Sql,
  orgId: string,
  roles: OrgRole[],
  notification: { type: string; severity: string; title: string; body: string; action_url: string }
): Promise<void> {
  await sql`
    INSERT INTO notifications (user_id, organization_id, type, severity, title, body, action_url)
    SELECT m.user_id, ${orgId}, ${notification.type}, ${notification.severity},
           ${notification.title}, ${notification.body}, ${notification.action_url}
    FROM organization_memberships m
    WHERE m.organization_id = ${orgId} AND m.status = 'active' AND m.role IN ${sql(roles)}`;
}

/**
 * Signed webhook delivery to product apps. Payload signature:
 * X-WPistic-Signature: t=<unix>,v1=hex(hmac_sha256(secret, `${t}.${body}`))
 */
async function fanOutWebhooks(event: EventEnvelope, sql: Sql, env: Env): Promise<HandleEventOutcome | void> {
  const data = event.data as Record<string, unknown>;
  const orgId = (data.org_id as string | undefined) ?? null;

  const subscriptions = await sql<
    Array<{ id: string; organization_id: string | null; url: string; signing_secret: string; event_types: string[]; failure_count: number }>
  >`
    SELECT id, organization_id, url, signing_secret, event_types, failure_count
    FROM webhook_subscriptions
    WHERE status = 'active'
      AND (organization_id IS NULL OR organization_id = ${orgId})
      AND (event_types = '[]'::jsonb OR event_types @> ${JSON.stringify([event.type])}::jsonb)`;

  let earliestRetrySeconds: number | undefined;

  for (const sub of subscriptions) {
    const deliveredKey = `webhook_delivered:${event.id}:${sub.id}`;
    if (await env.SESSION_CACHE.get(deliveredKey)) continue; // a prior attempt of this same message already reached this subscriber

    const retryKey = `webhook_retry:${event.id}:${sub.id}`;
    const body = JSON.stringify(event);
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = await hmacSha256Hex(sub.signing_secret, `${timestamp}.${body}`);

    let responseStatus: number | null = null;
    let errorMessage: string | null = null;
    try {
      const res = await fetch(sub.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-WPistic-Event': event.type,
          'X-WPistic-Delivery': event.id,
          'X-WPistic-Signature': `t=${timestamp},v1=${signature}`,
        },
        body,
        signal: AbortSignal.timeout(10_000),
      });
      responseStatus = res.status;
      if (!res.ok) errorMessage = `HTTP ${res.status}`;
    } catch (err) {
      errorMessage = String(err);
    }

    const delivered = responseStatus !== null && responseStatus >= 200 && responseStatus < 300;
    await sql`
      INSERT INTO webhook_deliveries (subscription_id, event_type, payload, attempt, response_status, error_message, delivered_at)
      VALUES (${sub.id}, ${event.type}, ${body}::jsonb, ${sub.failure_count + 1}, ${responseStatus},
              ${errorMessage}, ${delivered ? sql`NOW()` : null})`;

    if (delivered) {
      await env.SESSION_CACHE.put(deliveredKey, '1', { expirationTtl: WEBHOOK_STATE_TTL_SECONDS });
      await env.SESSION_CACHE.delete(retryKey);
      await sql`UPDATE webhook_subscriptions SET last_delivery_at = NOW(), failure_count = 0 WHERE id = ${sub.id}`;
      continue;
    }

    const priorAttempts = parseInt((await env.SESSION_CACHE.get(retryKey)) ?? '0', 10);
    const attempts = priorAttempts + 1;
    await sql`UPDATE webhook_subscriptions SET last_delivery_at = NOW(), failure_count = ${sub.failure_count + 1} WHERE id = ${sub.id}`;

    if (attempts > WEBHOOK_RETRY_SCHEDULE_SECONDS.length) {
      await env.SESSION_CACHE.delete(retryKey);
      await sql`UPDATE webhook_subscriptions SET status = 'suspended' WHERE id = ${sub.id}`;
      await notifyWebhookSuspended(sql, sub, errorMessage);
    } else {
      await env.SESSION_CACHE.put(retryKey, String(attempts), { expirationTtl: WEBHOOK_STATE_TTL_SECONDS });
      const delay = WEBHOOK_RETRY_SCHEDULE_SECONDS[attempts - 1]!;
      earliestRetrySeconds = earliestRetrySeconds ? Math.min(earliestRetrySeconds, delay) : delay;
    }
  }

  return earliestRetrySeconds ? { retryAfterSeconds: earliestRetrySeconds } : undefined;
}

async function notifyWebhookSuspended(
  sql: Sql,
  sub: { id: string; organization_id: string | null; url: string },
  lastError: string | null
): Promise<void> {
  if (sub.organization_id) {
    await notifyOrgRoles(sql, sub.organization_id, ['owner', 'admin'], {
      type: 'webhook.suspended',
      severity: 'critical',
      title: 'Webhook subscription suspended',
      body: `Deliveries to ${sub.url} failed repeatedly and have been suspended. Last error: ${lastError ?? 'unknown'}.`,
      action_url: '/settings/webhooks',
    });
    return;
  }
  console.error(
    JSON.stringify({
      level: 'error',
      message: 'platform webhook subscription suspended after exhausting retries',
      subscription_id: sub.id,
      url: sub.url,
      last_error: lastError,
    })
  );
}

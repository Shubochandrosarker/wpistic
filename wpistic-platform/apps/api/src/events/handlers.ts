/**
 * Queue consumer: reacts to domain events — entitlement cache invalidation,
 * in-app notifications, and signed webhook fan-out to product apps.
 * Receivers must be idempotent: a retried batch may redeliver events.
 */
import type { Sql } from 'postgres';
import type { EventEnvelope, OrgRole } from '@wpistic/types';
import type { Env } from '../env';
import { createDb } from '../db';
import { hmacSha256Hex } from '../utils/crypto';

const LOW_CREDIT_THRESHOLD = 50;

export async function handleQueueBatch(batch: MessageBatch<EventEnvelope>, env: Env, ctx: ExecutionContext): Promise<void> {
  const sql = createDb(env);
  try {
    for (const message of batch.messages) {
      try {
        await handleEvent(message.body, sql, env);
        message.ack();
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
  } finally {
    ctx.waitUntil(sql.end({ timeout: 5 }));
  }
}

async function handleEvent(event: EventEnvelope, sql: Sql, env: Env): Promise<void> {
  const data = event.data as Record<string, unknown>;
  const orgId = (data.org_id as string | undefined) ?? null;

  switch (event.type) {
    case 'entitlements.changed':
      if (orgId) await env.SESSION_CACHE.delete(`ent:${orgId}`);
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

  await fanOutWebhooks(event, sql, env);
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
async function fanOutWebhooks(event: EventEnvelope, sql: Sql, env: Env): Promise<void> {
  const data = event.data as Record<string, unknown>;
  const orgId = (data.org_id as string | undefined) ?? null;

  const subscriptions = await sql<
    Array<{ id: string; url: string; signing_secret: string; event_types: string[]; failure_count: number }>
  >`
    SELECT id, url, signing_secret, event_types, failure_count
    FROM webhook_subscriptions
    WHERE status = 'active'
      AND (organization_id IS NULL OR organization_id = ${orgId})
      AND (event_types = '[]'::jsonb OR event_types @> ${JSON.stringify([event.type])}::jsonb)`;

  for (const sub of subscriptions) {
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
    await sql`
      UPDATE webhook_subscriptions
      SET last_delivery_at = NOW(),
          failure_count = ${delivered ? 0 : sub.failure_count + 1},
          status = ${!delivered && sub.failure_count + 1 >= 5 ? 'suspended' : 'active'}
      WHERE id = ${sub.id}`;
  }
}

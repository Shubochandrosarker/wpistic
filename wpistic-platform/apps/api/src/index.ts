/**
 * api.wpistic.com — WPistic control plane.
 *
 * Modular monolith: one Hono Worker, strict internal module boundaries
 * (identity, orgs, catalog, entitlements, licenses, billing, websites,
 * ai-credits, support, notifications, audit, admin), Cloudflare Queues for
 * domain events, Hyperdrive PostgreSQL, KV for rate limits + caches, R2 for
 * update packages.
 */
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { EventEnvelope } from '@wpistic/types';
import type { AppContext, Env } from './env';
import { createDb } from './db';
import { errorResponse } from './errors';
import { EventBus } from './events/bus';
import { handleQueueBatch } from './events/handlers';
import { publishOutboxBatch } from './events/outbox';
import { correlationId, requestLogger } from './middleware/correlation';
import { rateLimiter } from './middleware/rate-limit';
import { jwtAuth } from './middleware/auth';
import { injectOrgContext } from './middleware/tenant';
import { auditMiddleware } from './middleware/audit';

import { meRoutes, memberRoutes, invitationRoutes, invitationAcceptRoute } from './modules/identity/routes';
import { apiKeyRoutes } from './modules/identity/api-keys';
import { orgRoutes, authRoutes } from './modules/orgs/routes';
import { productRoutes, orgProductRoutes } from './modules/catalog/routes';
import { downloadRoutes, handleProductUpdates } from './modules/updates/routes';
import { entitlementRoutes } from './modules/entitlements/routes';
import {
  licenseRoutes,
  licenseActivateRoute,
  licenseValidateRoute,
  licenseDeactivateRoute,
  licenseRefreshRoute,
} from './modules/licenses/routes';
import { billingRoutes, subscriptionRoutes, invoiceRoutes, stripeWebhookRoute } from './modules/billing/routes';
import { websiteRoutes, websiteConnectRoute, websiteHeartbeatRoute } from './modules/websites/routes';
import { aiCreditRoutes, usageEventRoutes } from './modules/ai-credits/routes';
import { supportRoutes } from './modules/support/routes';
import { notificationRoutes } from './modules/notifications/routes';
import { auditRoutes } from './modules/audit/routes';
import { adminRoutes } from './modules/admin/routes';

/**
 * Exported so the self-hosted Node entry point (`server.node.ts`) can serve the
 * identical app. `app.fetch(request, env, ctx)` takes its bindings as
 * arguments, so the same routes run on Workers or on a VPS with no fork.
 */
export const app = new Hono<AppContext>();

// ---------------------------------------------------------------------------
// Middleware stack (order matters)
// ---------------------------------------------------------------------------

function allowedOrigins(environment: Env['ENVIRONMENT']): string[] {
  const origins = environment === 'production'
    ? ['https://www.wpistic.com', 'https://account.wpistic.com', 'https://api.wpistic.com', 'https://app.wpistic.com', 'https://admin.wpistic.com']
    : ['https://www-staging.wpistic.com', 'https://account-staging.wpistic.com', 'https://api-staging.wpistic.com', 'https://app-staging.wpistic.com', 'https://admin-staging.wpistic.com'];
  return [...origins, ...(environment === 'staging' ? ['http://localhost:5173', 'http://localhost:4321'] : [])];
}

app.use(
  '*',
  cors({
    origin: (origin, c) => allowedOrigins(c.env.ENVIRONMENT).includes(origin) ? origin : undefined,
    credentials: true,
    allowMethods: ['GET', 'POST', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'X-Idempotency-Key', 'X-Correlation-Id', 'X-Organization-Id'],
    exposeHeaders: ['X-Correlation-Id', 'X-RateLimit-Limit', 'X-RateLimit-Remaining'],
    maxAge: 600,
  })
);

app.use('*', correlationId);
app.use('*', requestLogger);
app.use('*', async (c, next) => {
  await next();
  c.header('Cache-Control', 'no-store');
  c.header('Pragma', 'no-cache');
  c.header('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'; form-action 'none'");
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('Referrer-Policy', 'no-referrer');
  c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
});
// Per-request DB client + event bus.
//
// This must precede the rate limiter: the limiter's counters live in Postgres
// (a single atomic INSERT ... ON CONFLICT, the only correct option across
// multiple isolates or processes), so it needs `sql` already on the context.
// Registered the other way round it silently fails open on every request.
app.use('*', async (c, next) => {
  const sql = createDb(c.env);
  c.set('sql', sql);
  c.set('events', new EventBus(c.env.EVENT_BUS, c.get('correlationId')));
  try {
    await next();
  } finally {
    await sql.end({ timeout: 1 }).catch(() => undefined);
  }
});

app.use('*', rateLimiter);

app.use('/api/v1/*', jwtAuth); // public plugin/webhook paths short-circuit inside
app.use('/api/v1/*', injectOrgContext); // tenant scope enforcement
app.use('/api/v1/*', auditMiddleware); // mutation capture

app.onError((err, c) => errorResponse(c, err));
app.notFound((c) =>
  c.json({ error: { code: 'not_found', message: 'Route not found', correlation_id: c.get('correlationId') } }, 404)
);

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

app.get('/health', (c) => c.json({ ok: true, service: 'wpistic-api' }));

app.route('/api/v1/auth', authRoutes); // switch-org
app.route('/api/v1/me', meRoutes);
app.route('/api/v1/invitations', invitationAcceptRoute);
app.route('/api/v1/organizations', orgRoutes);
app.route('/api/v1/organizations/:orgId/members', memberRoutes);
app.route('/api/v1/organizations/:orgId/invitations', invitationRoutes);
app.route('/api/v1/organizations/:orgId/api-keys', apiKeyRoutes);
app.route('/api/v1/products', productRoutes);
app.get('/api/v1/products/:slug/updates', handleProductUpdates); // public, license-gated
app.route('/api/v1/downloads', downloadRoutes); // public, token-gated
app.route('/api/v1/organizations/:orgId/products', orgProductRoutes);
app.route('/api/v1/organizations/:orgId/entitlements', entitlementRoutes);
app.route('/api/v1/organizations/:orgId/subscriptions', subscriptionRoutes);
app.route('/api/v1/organizations/:orgId/licenses', licenseRoutes);
app.route('/api/v1/licenses/activate', licenseActivateRoute);
app.route('/api/v1/licenses/validate', licenseValidateRoute);
app.route('/api/v1/licenses/deactivate', licenseDeactivateRoute);
app.route('/api/v1/licenses/refresh', licenseRefreshRoute);
app.route('/api/v1/organizations/:orgId/websites', websiteRoutes);
app.route('/api/v1/websites/connect', websiteConnectRoute);
app.route('/api/v1/websites/heartbeat', websiteHeartbeatRoute);
app.route('/api/v1/organizations/:orgId/billing', billingRoutes);
app.route('/api/v1/organizations/:orgId/invoices', invoiceRoutes);
app.route('/api/v1/organizations/:orgId/ai-credits', aiCreditRoutes);
app.route('/api/v1/usage/events', usageEventRoutes);
app.route('/api/v1/organizations/:orgId/support', supportRoutes);
app.route('/api/v1/organizations/:orgId/notifications', notificationRoutes);
app.route('/api/v1/organizations/:orgId/audit', auditRoutes);
app.route('/api/v1/webhooks/stripe', stripeWebhookRoute);
app.route('/api/v1/admin', adminRoutes);

export default {
  fetch: app.fetch,
  queue: (batch: MessageBatch<EventEnvelope>, env: Env, ctx: ExecutionContext) => handleQueueBatch(batch, env, ctx),
  scheduled: (_event: ScheduledEvent, env: Env, ctx: ExecutionContext) => {
    ctx.waitUntil(runOutboxPublisher(env));
  },
};

/** Cron trigger (wrangler.jsonc `crons`, every minute) — drains the transactional outbox onto the real queue. */
async function runOutboxPublisher(env: Env): Promise<void> {
  const sql = createDb(env);
  try {
    const result = await publishOutboxBatch(sql, env.EVENT_BUS, (row) => {
      console.error(
        JSON.stringify({
          level: 'error',
          message: 'outbox event exhausted retries — see event_outbox for the dead-lettered row',
          outbox_id: row.id,
          event_type: row.eventType,
          error: row.error,
        })
      );
    });
      if (result.published || result.retried || result.exhausted) {
        console.log(JSON.stringify({ level: 'info', message: 'outbox publish cycle', ...result }));
      }
  } finally {
    await sql.end({ timeout: 1 }).catch(() => undefined);
  }
}

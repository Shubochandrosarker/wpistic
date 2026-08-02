/**
 * Admin module (admin.wpistic.com backend). Auth: the admin portal's
 * server-side ADMIN_API_TOKEN, or a staff JWT whose email is in ADMIN_EMAILS.
 * Impersonation additionally demands a fresh MFA code and a written reason,
 * and mints a 30-minute restricted token; every admin mutation is audited
 * with actor_type='admin'.
 */
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { SignJWT, importPKCS8 } from 'jose';
import type { Context, MiddlewareHandler } from 'hono';
import { adminLicenseActionSchema, impersonateSchema } from '@wpistic/types';
import type { AppContext, Env } from '../../env';
import { ApiError } from '../../errors';
import { getClientIp } from '../../middleware/correlation';
import { decryptMfaSecret, verifyTotpCode } from '../../utils/totp';
import { makeLicenseService } from '../licenses/routes';
import { resolveAdminRole } from '../../middleware/auth';
import { EntitlementService } from '../entitlements/service';
import { makeBillingService } from '../billing/routes';
import { packageRoutes } from '../updates/routes';

const requireAdmin: MiddlewareHandler<AppContext> = async (c, next) => {
  const kind = c.get('authKind');
  if (kind === 'admin_token') return next();
  if (kind === 'jwt') {
    const email = c.get('user')?.email?.toLowerCase();
    const allowlist = c.env.ADMIN_EMAILS.split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
    if (email && allowlist.includes(email)) {
      c.set('adminRole', resolveAdminRole(c.req.header('X-Admin-Role')));
      return next();
    }
  }
  throw ApiError.forbidden('Admin access required');
};

async function adminAudit(
  c: Context<AppContext>,
  action: string,
  resourceType: string,
  resourceId: string | null,
  orgId: string | null,
  details: Record<string, unknown>
): Promise<void> {
  const sql = c.get('sql');
  await sql`
    INSERT INTO audit_logs (organization_id, user_id, actor_type, action, resource_type, resource_id,
                            new_values, ip_address, user_agent, correlation_id)
    VALUES (${orgId}, ${c.get('user')?.id ?? null}, 'admin', ${action}, ${resourceType}, ${resourceId},
            ${sql.json(details as never)}, ${getClientIp(c)}, ${c.req.header('User-Agent') ?? null},
            ${c.get('correlationId')})`;
}

export const adminRoutes = new Hono<AppContext>();
adminRoutes.use('*', requireAdmin);

// ---------------------------------------------------------------------------
// Dashboard stats
// ---------------------------------------------------------------------------

adminRoutes.get('/stats', async (c) => {
  const sql = c.get('sql');
  const [row] = await sql<
    Array<{
      total_customers: number;
      active_subscriptions: number;
      active_licenses: number;
      open_tickets: number;
      failed_webhooks: number;
      connected_websites: number;
    }>
  >`
    SELECT
      (SELECT COUNT(*)::int FROM organizations WHERE status = 'active') AS total_customers,
      (SELECT COUNT(*)::int FROM subscriptions WHERE status IN ('active', 'trialing', 'lifetime')) AS active_subscriptions,
      (SELECT COUNT(*)::int FROM licenses WHERE status = 'active') AS active_licenses,
      (SELECT COUNT(*)::int FROM support_tickets WHERE status = 'open') AS open_tickets,
      (SELECT COUNT(*)::int FROM webhook_events WHERE processed_at IS NULL AND error_message IS NOT NULL) AS failed_webhooks,
      (SELECT COUNT(*)::int FROM websites WHERE is_connected = TRUE) AS connected_websites`;

  // Approximate MRR: sum of monthly-equivalent price amounts on entitled subscriptions.
  const [mrr] = await sql<Array<{ mrr_cents: string | null }>>`
    SELECT SUM(
      CASE pr."interval"
        WHEN 'month' THEN pr.amount * si.quantity
        WHEN 'year' THEN (pr.amount * si.quantity) / 12
        ELSE 0
      END
    )::bigint::text AS mrr_cents
    FROM subscriptions s
    JOIN subscription_items si ON si.subscription_id = s.id
    JOIN prices pr ON pr.id = si.price_id
    WHERE s.status IN ('active', 'trialing', 'past_due', 'grace_period')`;

  const signups = await sql`
    SELECT o.id, o.name, o.slug, o.created_at, u.email AS owner_email
    FROM organizations o
    LEFT JOIN organization_memberships m ON m.organization_id = o.id AND m.role = 'owner'
    LEFT JOIN users u ON u.id = m.user_id
    ORDER BY o.created_at DESC LIMIT 10`;

  const revenue = await sql`
    SELECT date_trunc('day', paid_at)::date::text AS day, SUM(amount_paid)::bigint AS cents
    FROM invoices
    WHERE paid_at > NOW() - INTERVAL '30 days'
    GROUP BY 1 ORDER BY 1`;

  return c.json({
    stats: { ...row, mrr_cents: parseInt(mrr?.mrr_cents ?? '0', 10) },
    recent_signups: signups,
    revenue_by_day: revenue,
  });
});

// ---------------------------------------------------------------------------
// Customers / organizations
// ---------------------------------------------------------------------------

adminRoutes.get('/customers', async (c) => {
  const query = (c.req.query('query') ?? '').trim();
  const limit = Math.min(parseInt(c.req.query('limit') ?? '50', 10) || 50, 200);
  const offset = parseInt(c.req.query('offset') ?? '0', 10) || 0;
  const like = `%${query}%`;

  const customers = await c.get('sql')`
    SELECT o.id, o.name, o.slug, o.status, o.created_at, u.email AS owner_email,
           (SELECT COUNT(*)::int FROM organization_memberships mm
             WHERE mm.organization_id = o.id AND mm.status = 'active') AS member_count,
           (SELECT COUNT(*)::int FROM subscriptions s
             WHERE s.organization_id = o.id AND s.status IN ('active','trialing','lifetime')) AS active_subscriptions
    FROM organizations o
    LEFT JOIN organization_memberships m ON m.organization_id = o.id AND m.role = 'owner'
    LEFT JOIN users u ON u.id = m.user_id
    WHERE (${query} = '' OR o.name ILIKE ${like} OR o.slug ILIKE ${like} OR u.email ILIKE ${like})
    ORDER BY o.created_at DESC
    LIMIT ${limit} OFFSET ${offset}`;
  return c.json({ customers });
});

adminRoutes.get('/organizations/:orgId', async (c) => {
  const sql = c.get('sql');
  const orgId = c.req.param('orgId');
  const orgs = await sql`
    SELECT id, name, slug, billing_email, status, metadata, created_at
    FROM organizations WHERE id = ${orgId} LIMIT 1`;
  if (!orgs[0]) throw ApiError.notFound('Organization');

  const [members, subscriptions, licenses, websites, timeline] = await Promise.all([
    sql`SELECT m.id, m.role, m.status, u.email, u.first_name, u.last_name
        FROM organization_memberships m JOIN users u ON u.id = m.user_id
        WHERE m.organization_id = ${orgId} ORDER BY m.created_at`,
    sql`SELECT id, status, stripe_subscription_id, current_period_end, created_at
        FROM subscriptions WHERE organization_id = ${orgId} ORDER BY created_at DESC`,
    sql`SELECT l.id, l.key_mask, l.status, l.max_activations, l.expires_at, p.slug AS product
        FROM licenses l JOIN products p ON p.id = l.product_id
        WHERE l.organization_id = ${orgId} ORDER BY l.created_at DESC`,
    sql`SELECT id, domain_normalized, environment, is_connected, health_status, last_sync_at
        FROM websites WHERE organization_id = ${orgId} ORDER BY created_at DESC`,
    sql`SELECT action, resource_type, actor_type, created_at, correlation_id
        FROM audit_logs WHERE organization_id = ${orgId} ORDER BY created_at DESC LIMIT 50`,
  ]);

  return c.json({ organization: orgs[0], members, subscriptions, licenses, websites, timeline });
});

// ---------------------------------------------------------------------------
// Licenses
// ---------------------------------------------------------------------------

adminRoutes.get('/licenses', async (c) => {
  const query = (c.req.query('query') ?? '').trim();
  const status = c.req.query('status') ?? '';
  const like = `%${query}%`;
  const licenses = await c.get('sql')`
    SELECT l.id, l.key_mask, l.key_prefix, l.status, l.max_activations, l.expires_at, l.created_at,
           p.slug AS product, o.name AS organization, o.id AS organization_id,
           (SELECT COUNT(*)::int FROM license_activations a
             WHERE a.license_id = l.id AND a.status = 'active') AS active_activations
    FROM licenses l
    JOIN products p ON p.id = l.product_id
    JOIN organizations o ON o.id = l.organization_id
    WHERE (${query} = '' OR l.key_prefix ILIKE ${like} OR l.key_mask ILIKE ${like} OR o.name ILIKE ${like}
           OR EXISTS (SELECT 1 FROM license_activations a
                      WHERE a.license_id = l.id AND a.domain_normalized ILIKE ${like}))
      AND (${status} = '' OR l.status = ${status})
    ORDER BY l.created_at DESC LIMIT 100`;
  return c.json({ licenses });
});

adminRoutes.post('/licenses/:licenseId/action', zValidator('json', adminLicenseActionSchema), async (c) => {
  const sql = c.get('sql');
  const licenseId = c.req.param('licenseId');
  const { action, reason } = c.req.valid('json');
  const admin = c.get('user');
  const actor = { type: 'admin' as const, id: admin?.id ?? null, email: admin?.email ?? null };

  const rows = await sql<{ id: string; organization_id: string; status: string }[]>`
    SELECT id, organization_id, status FROM licenses WHERE id = ${licenseId} LIMIT 1`;
  const license = rows[0];
  if (!license) throw ApiError.notFound('License');

  const licenses = makeLicenseService(c);

  switch (action) {
    case 'suspend':
      await sql`UPDATE licenses SET status = 'suspended' WHERE id = ${licenseId}`;
      break;
    case 'reactivate':
      await sql`UPDATE licenses SET status = 'active', revoked_at = NULL, revoked_reason = NULL
                WHERE id = ${licenseId}`;
      break;
    case 'revoke': {
      await sql`UPDATE licenses SET status = 'revoked', revoked_at = NOW(), revoked_reason = ${reason}
                WHERE id = ${licenseId}`;
      const activeActivations = await sql<Array<{ id: string; license_id: string; organization_id: string; website_id: string | null; domain_normalized: string; installation_uuid: string; environment: string; status: string; token_hash: string | null }>>`
        SELECT id, license_id, organization_id, website_id, domain_normalized, installation_uuid, environment, status, token_hash
        FROM license_activations WHERE license_id = ${licenseId} AND status = 'active'`;
      for (const activation of activeActivations) {
        await licenses.deactivateById(activation as never, `admin_revoke:${reason}`, getClientIp(c), actor);
      }
      break;
    }
    case 'reset_activations':
      await sql`UPDATE license_activations SET status = 'inactive', deactivated_at = NOW()
                WHERE license_id = ${licenseId} AND status = 'active'`;
      break;
  }

  await licenses.logEvent(sql, {
    licenseId,
    organizationId: license.organization_id,
    eventType: `admin_${action}`,
    actor,
    ip: getClientIp(c),
    meta: { reason },
  });
  await adminAudit(c, `license.${action}`, 'licenses', licenseId, license.organization_id, { reason });
  await new EntitlementService(sql, c.env.SESSION_CACHE).invalidate(license.organization_id);
  return c.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Subscriptions / invoices
// ---------------------------------------------------------------------------

adminRoutes.get('/subscriptions', async (c) => {
  const status = c.req.query('status') ?? '';
  const subscriptions = await c.get('sql')`
    SELECT s.id, s.status, s.stripe_subscription_id, s.current_period_end, s.cancel_at_period_end,
           s.created_at, o.name AS organization, o.id AS organization_id,
           COALESCE((SELECT json_agg(json_build_object('product', p.slug, 'plan', pl.slug))
                     FROM subscription_items si
                     JOIN products p ON p.id = si.product_id
                     JOIN plans pl ON pl.id = si.plan_id
                     WHERE si.subscription_id = s.id), '[]'::json) AS items
    FROM subscriptions s
    JOIN organizations o ON o.id = s.organization_id
    WHERE (${status} = '' OR s.status = ${status})
    ORDER BY s.created_at DESC LIMIT 100`;
  return c.json({ subscriptions });
});

adminRoutes.post('/subscriptions/:subscriptionId/cancel', zValidator('json', z.object({ reason: z.string().min(3).max(500) })), async (c) => {
  const sql = c.get('sql');
  const rows = await sql<{ id: string; organization_id: string }[]>`
    SELECT id, organization_id FROM subscriptions WHERE id = ${c.req.param('subscriptionId')} LIMIT 1`;
  if (!rows[0]) throw ApiError.notFound('Subscription');
  const subscription = await makeBillingService(c).cancelSubscription(rows[0].organization_id, rows[0].id);
  await adminAudit(c, 'subscription.cancel', 'subscriptions', rows[0].id, rows[0].organization_id, c.req.valid('json'));
  return c.json({ subscription });
});

adminRoutes.get('/invoices', async (c) => {
  const invoices = await c.get('sql')`
    SELECT i.id, i.stripe_invoice_id, i.amount_due, i.amount_paid, i.currency, i.status,
           i.pdf_url, i.paid_at, i.created_at, o.name AS organization
    FROM invoices i
    JOIN organizations o ON o.id = i.organization_id
    ORDER BY i.created_at DESC LIMIT 100`;
  return c.json({ invoices });
});

// ---------------------------------------------------------------------------
// Audit + system health
// ---------------------------------------------------------------------------

adminRoutes.get('/audit', async (c) => {
  const orgId = c.req.query('org_id') ?? '';
  const action = c.req.query('action') ?? '';
  const correlation = c.req.query('correlation_id') ?? '';
  const logs = await c.get('sql')`
    SELECT a.id, a.organization_id, a.actor_type, a.action, a.resource_type, a.resource_id,
           a.new_values, a.ip_address::text AS ip_address, a.correlation_id, a.created_at,
           u.email AS actor_email, o.name AS organization
    FROM audit_logs a
    LEFT JOIN users u ON u.id = a.user_id
    LEFT JOIN organizations o ON o.id = a.organization_id
    WHERE (${orgId} = '' OR a.organization_id = ${orgId || null})
      AND (${action} = '' OR a.action ILIKE ${`%${action}%`})
      AND (${correlation} = '' OR a.correlation_id = ${correlation})
    ORDER BY a.created_at DESC LIMIT 200`;
  return c.json({ logs });
});

adminRoutes.get('/system', async (c) => {
  const sql = c.get('sql');
  const [webhookStats] = await sql<Array<{ total: number; failed: number; unprocessed: number }>>`
    SELECT COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE error_message IS NOT NULL)::int AS failed,
           COUNT(*) FILTER (WHERE processed_at IS NULL)::int AS unprocessed
    FROM webhook_events WHERE created_at > NOW() - INTERVAL '24 hours'`;
  const failedEvents = await sql`
    SELECT id, event_type, provider, provider_event_id, error_message, retry_count, created_at
    FROM webhook_events
    WHERE processed_at IS NULL AND error_message IS NOT NULL
    ORDER BY created_at DESC LIMIT 25`;
  const failedDeliveries = await sql`
    SELECT d.id, d.event_type, d.response_status, d.error_message, d.created_at, s.url
    FROM webhook_deliveries d
    JOIN webhook_subscriptions s ON s.id = d.subscription_id
    WHERE d.delivered_at IS NULL AND d.created_at > NOW() - INTERVAL '24 hours'
    ORDER BY d.created_at DESC LIMIT 25`;
  return c.json({ webhook_stats: webhookStats, failed_events: failedEvents, failed_deliveries: failedDeliveries });
});

/** Replay a stored (failed) Stripe webhook event. */
adminRoutes.post('/webhooks/:eventId/retry', async (c) => {
  const sql = c.get('sql');
  const rows = await sql<Array<{ id: string; provider_event_id: string; payload: { type: string; data: { object: Record<string, unknown> } } }>>`
    SELECT id, provider_event_id, payload FROM webhook_events
    WHERE id = ${c.req.param('eventId')} AND provider = 'stripe' LIMIT 1`;
  const event = rows[0];
  if (!event) throw ApiError.notFound('Webhook event');

  const service = makeBillingService(c);
  try {
    await service.processWebhookEvent(event.payload.type, event.payload.data.object);
    await service.markWebhookProcessed(event.provider_event_id);
  } catch (err) {
    await service.markWebhookProcessed(event.provider_event_id, err instanceof Error ? err.message : String(err));
    throw ApiError.badRequest('replay_failed', 'Webhook replay failed — see webhook_events.error_message');
  }
  await adminAudit(c, 'webhook.replay', 'webhook_events', event.id, null, {});
  return c.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Complimentary access + impersonation
// ---------------------------------------------------------------------------

adminRoutes.post(
  '/organizations/:orgId/grant',
  zValidator(
    'json',
    z.object({
      product_slug: z.string().min(1),
      plan_slug: z.string().min(1),
      reason: z.string().min(10).max(500),
      expires_at: z.string().datetime().optional(),
    })
  ),
  async (c) => {
    const sql = c.get('sql');
    const orgId = c.req.param('orgId');
    const body = c.req.valid('json');

    const rows = await sql<Array<{ product_id: string; plan_id: string; product_type: string }>>`
      SELECT p.id AS product_id, pl.id AS plan_id, p.type AS product_type
      FROM products p JOIN plans pl ON pl.product_id = p.id
      WHERE p.slug = ${body.product_slug} AND pl.slug = ${body.plan_slug} LIMIT 1`;
    const target = rows[0];
    if (!target) throw ApiError.notFound('Product/plan');

    const subRows = await sql<{ id: string }[]>`
      INSERT INTO subscriptions (organization_id, status, current_period_end, metadata)
      VALUES (${orgId}, 'lifetime', ${body.expires_at ?? null},
              ${sql.json({ complimentary: true, reason: body.reason } as never)})
      RETURNING id`;
    const subscriptionId = subRows[0]!.id;
    await sql`
      INSERT INTO subscription_items (subscription_id, product_id, plan_id, price_id, quantity)
      SELECT ${subscriptionId}, ${target.product_id}, ${target.plan_id}, pr.id, 1
      FROM prices pr WHERE pr.plan_id = ${target.plan_id} ORDER BY pr.is_default DESC LIMIT 1`;

    let licenseKey: string | null = null;
    if (target.product_type === 'plugin') {
      const licenses = makeLicenseService(c);
      const issued = await licenses.issue({
        organizationId: orgId,
        productId: target.product_id,
        planId: target.plan_id,
        subscriptionId,
        expiresAt: body.expires_at ? new Date(body.expires_at) : null,
      });
      licenseKey = issued.rawKey;
    }

    await new EntitlementService(sql, c.env.SESSION_CACHE).invalidate(orgId);
    await c.get('events').publish('entitlements.changed', {
      org_id: orgId,
      product_id: target.product_id,
      version: Math.floor(Date.now() / 1000),
    });
    await adminAudit(c, 'organization.grant_access', 'subscriptions', subscriptionId, orgId, {
      product: body.product_slug,
      plan: body.plan_slug,
      reason: body.reason,
    });
    return c.json({ subscription_id: subscriptionId, license_key: licenseKey }, 201);
  }
);

let impersonationKeyPromise: Promise<CryptoKey> | null = null;
function getImpersonationKey(env: Env): Promise<CryptoKey> {
  impersonationKeyPromise ??= importPKCS8(env.JWT_PRIVATE_KEY.replace(/\\n/g, '\n'), 'RS256');
  return impersonationKeyPromise;
}

/**
 * POST /api/v1/admin/impersonate — staff JWT only (not the portal token),
 * fresh MFA code, and a written reason. Issues a 30-minute access token
 * carrying imp=true; billing/destructive routes reject it, every action it
 * performs is audited as actor_type='admin', and org owners are notified.
 */
adminRoutes.post('/impersonate', zValidator('json', impersonateSchema), async (c) => {
  if (c.get('authKind') !== 'jwt') {
    throw ApiError.forbidden('Impersonation requires a personal staff session, not the portal token');
  }
  const sql = c.get('sql');
  const admin = c.get('user')!;
  const body = c.req.valid('json');

  const users = await sql<Array<{ mfa_enabled: boolean; mfa_secret: string | null }>>`
    SELECT mfa_enabled, mfa_secret FROM users WHERE id = ${admin.id} LIMIT 1`;
  const adminUser = users[0];
  if (!adminUser?.mfa_enabled || !adminUser.mfa_secret) {
    throw ApiError.forbidden('Enable MFA on your account before impersonating customers');
  }
  const secret = await decryptMfaSecret(adminUser.mfa_secret, c.env.MFA_ENC_KEY);
  if (!(await verifyTotpCode(secret, body.mfa_code))) {
    throw ApiError.unauthorized('MFA code is invalid');
  }

  const orgs = await sql<{ id: string; name: string }[]>`
    SELECT id, name FROM organizations WHERE id = ${body.organization_id} LIMIT 1`;
  if (!orgs[0]) throw ApiError.notFound('Organization');

  const key = await getImpersonationKey(c.env);
  const expiresIn = 30 * 60;
  const token = await new SignJWT({
    email: admin.email,
    org_id: body.organization_id,
    org_role: 'admin',
    scope: 'openid profile email org',
    imp: true,
    imp_admin: admin.email,
  })
    .setProtectedHeader({ alg: 'RS256', kid: 'wpistic-1' })
    .setSubject(admin.id)
    .setAudience('wpistic_dashboard')
    .setIssuer(c.env.ACCOUNT_SERVICE_URL)
    .setIssuedAt()
    .setExpirationTime(`${expiresIn}s`)
    .sign(key);

  await adminAudit(c, 'organization.impersonate', 'organizations', body.organization_id, body.organization_id, {
    reason: body.reason,
    expires_in: expiresIn,
  });
  await sql`
    INSERT INTO security_events (user_id, organization_id, event_type, severity, metadata)
    VALUES (${admin.id}, ${body.organization_id}, 'admin.impersonation', 'warning',
            ${sql.json({ reason: body.reason, admin: admin.email } as never)})`;
  // Owners get an in-app notification that staff accessed their workspace.
  await sql`
    INSERT INTO notifications (user_id, organization_id, type, severity, title, body)
    SELECT m.user_id, ${body.organization_id}, 'security.impersonation', 'warning',
           'WPistic support accessed your workspace',
           ${'A WPistic staff member temporarily accessed your organization for support purposes: ' + body.reason}
    FROM organization_memberships m
    WHERE m.organization_id = ${body.organization_id} AND m.role = 'owner' AND m.status = 'active'`;

  return c.json({
    access_token: token,
    token_type: 'Bearer',
    expires_in: expiresIn,
    organization: orgs[0],
    restrictions: ['billing', 'destructive_actions', 'password_changes'],
  });
});

// ---------------------------------------------------------------------------
// Update packages — /api/v1/admin/packages (upload, publish, rollback).
// The canonical implementation lives in modules/updates; this is the only
// path for release management (the legacy product_releases table is retired).
// ---------------------------------------------------------------------------

adminRoutes.route('/packages', packageRoutes);

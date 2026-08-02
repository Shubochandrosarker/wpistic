import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import type { Context } from 'hono';
import { checkoutSchema, BILLING_ROLES } from '@wpistic/types';
import type { AppContext } from '../../env';
import { requireOrg, requireRole, blockImpersonation } from '../../middleware/tenant';
import { idempotency } from '../../middleware/idempotency';
import { BillingService } from './service';
import { StripeClient, verifyStripeSignature } from './stripe';
import { LicenseService } from '../licenses/service';
import { CreditService } from '../ai-credits/service';
import { EntitlementService } from '../entitlements/service';

export function makeBillingService(c: Context<AppContext>): BillingService {
  const sql = c.get('sql');
  const events = c.get('events');
  return new BillingService(sql, events, {
    stripe: new StripeClient(c.env.STRIPE_SECRET_KEY),
    licenses: new LicenseService(sql, events, c.env.LICENSE_SIGNING_SECRET, c.env.SESSION_CACHE),
    credits: new CreditService(sql, events),
    entitlements: new EntitlementService(sql, c.env.SESSION_CACHE),
    dashboardUrl: c.env.DASHBOARD_URL,
  });
}

// ---------------------------------------------------------------------------
// /api/v1/organizations/:orgId/billing
// ---------------------------------------------------------------------------

export const billingRoutes = new Hono<AppContext>();

billingRoutes.get('/', async (c) => {
  const { orgId } = requireOrg(c);
  const service = makeBillingService(c);
  const [subscriptions, invoices] = await Promise.all([
    service.listSubscriptions(orgId),
    service.listInvoices(orgId),
  ]);
  return c.json({
    subscriptions,
    recent_invoices: invoices.slice(0, 3),
    stripe_publishable_key: c.env.STRIPE_PUBLISHABLE_KEY,
  });
});

billingRoutes.post('/checkout', idempotency({ required: true }), zValidator('json', checkoutSchema), async (c) => {
  const { orgId } = requireRole(c, BILLING_ROLES);
  blockImpersonation(c);
  const result = await makeBillingService(c).createCheckout(orgId, c.req.valid('json'));
  return c.json(result);
});

billingRoutes.post('/portal', async (c) => {
  const { orgId } = requireRole(c, BILLING_ROLES);
  blockImpersonation(c);
  const result = await makeBillingService(c).createPortal(orgId);
  return c.json(result);
});

// ---------------------------------------------------------------------------
// /api/v1/organizations/:orgId/subscriptions
// ---------------------------------------------------------------------------

export const subscriptionRoutes = new Hono<AppContext>();

subscriptionRoutes.get('/', async (c) => {
  const { orgId } = requireOrg(c);
  return c.json({ subscriptions: await makeBillingService(c).listSubscriptions(orgId) });
});

subscriptionRoutes.post('/:subscriptionId/cancel', idempotency(), async (c) => {
  const { orgId } = requireRole(c, BILLING_ROLES);
  blockImpersonation(c);
  const subscription = await makeBillingService(c).cancelSubscription(orgId, c.req.param('subscriptionId'));
  return c.json({ subscription });
});

// ---------------------------------------------------------------------------
// /api/v1/organizations/:orgId/invoices
// ---------------------------------------------------------------------------

export const invoiceRoutes = new Hono<AppContext>();

invoiceRoutes.get('/', async (c) => {
  const { orgId } = requireOrg(c);
  return c.json({ invoices: await makeBillingService(c).listInvoices(orgId) });
});

// ---------------------------------------------------------------------------
// POST /api/v1/webhooks/stripe — public, signature-verified
// ---------------------------------------------------------------------------

export const stripeWebhookRoute = new Hono<AppContext>();

stripeWebhookRoute.post('/', async (c) => {
  const payload = await c.req.text();
  const signature = c.req.header('Stripe-Signature') ?? null;

  if (!(await verifyStripeSignature(payload, signature, c.env.STRIPE_WEBHOOK_SECRET))) {
    return c.json({ error: { code: 'invalid_signature', message: 'Stripe signature verification failed' } }, 400);
  }

  const event = JSON.parse(payload) as {
    id: string;
    type: string;
    data: { object: Record<string, unknown> };
  };

  const service = makeBillingService(c);
  const isNew = await service.recordWebhookEvent(event.id, event.type, event, signature);
  if (!isNew) {
    return c.json({ received: true, duplicate: true });
  }

  try {
    await service.processWebhookEvent(event.type, event.data.object);
    await service.markWebhookProcessed(event.id);
  } catch (err) {
    await service.markWebhookProcessed(event.id, err instanceof Error ? err.message : String(err));
    // 500 → Stripe retries with backoff; processing is idempotent per event id
    // because the raw event row survives and admin can also replay it.
    return c.json({ error: { code: 'processing_failed', message: 'Webhook processing failed' } }, 500);
  }

  return c.json({ received: true });
});

/**
 * Billing: Stripe checkout/portal, internal subscription records, and
 * idempotent webhook processing. Stripe is the payment processor, never the
 * authorization source — entitlements always resolve from internal records.
 *
 * Webhook flow: verify signature → store raw event (unique on Stripe event
 * id) → process → update internal subscription → recalculate entitlements →
 * publish events.
 */
import type { Sql } from 'postgres';
import { ApiError } from '../../errors';
import type { EventBus } from '../../events/bus';
import { StripeClient } from './stripe';
import { CreditService } from '../ai-credits/service';
import { LicenseService } from '../licenses/service';
import { EntitlementService } from '../entitlements/service';

interface PriceRow {
  id: string;
  plan_id: string;
  stripe_price_id: string | null;
  amount: number;
  currency: string;
  interval: 'month' | 'year' | 'lifetime' | null;
  trial_days: number;
  plan_slug: string;
  plan_name: string;
  product_id: string;
  product_slug: string;
  product_name: string;
  product_type: string;
}

export interface BillingDeps {
  stripe: StripeClient;
  licenses: LicenseService;
  credits: CreditService;
  entitlements: EntitlementService;
  dashboardUrl: string;
}

export class BillingService {
  constructor(
    private sql: Sql,
    private events: EventBus,
    private deps: BillingDeps
  ) {}

  // -------------------------------------------------------------------------
  // Customer-facing
  // -------------------------------------------------------------------------

  private async loadPrice(priceId: string): Promise<PriceRow> {
    const rows = await this.sql<PriceRow[]>`
      SELECT pr.id, pr.plan_id, pr.stripe_price_id, pr.amount, pr.currency, pr."interval", pr.trial_days,
             pl.slug AS plan_slug, pl.name AS plan_name,
             p.id AS product_id, p.slug AS product_slug, p.name AS product_name, p.type AS product_type
      FROM prices pr
      JOIN plans pl ON pl.id = pr.plan_id
      JOIN products p ON p.id = pl.product_id
      WHERE pr.id = ${priceId} AND pr.status = 'active'
      LIMIT 1`;
    if (!rows[0]) throw ApiError.notFound('Price');
    return rows[0];
  }

  private async ensureStripeCustomer(orgId: string): Promise<string> {
    const orgs = await this.sql<Array<{ name: string; billing_email: string | null; metadata: Record<string, unknown> }>>`
      SELECT name, billing_email, metadata FROM organizations WHERE id = ${orgId} LIMIT 1`;
    const org = orgs[0];
    if (!org) throw ApiError.notFound('Organization');

    const existing = org.metadata?.stripe_customer_id;
    if (typeof existing === 'string' && existing) return existing;

    const customer = await this.deps.stripe.createCustomer({
      name: org.name,
      email: org.billing_email ?? undefined,
      metadata: { organization_id: orgId },
    });
    await this.sql`
      UPDATE organizations
      SET metadata = metadata || ${this.sql.json({ stripe_customer_id: customer.id } as never)}
      WHERE id = ${orgId}`;
    return customer.id;
  }

  async createCheckout(
    orgId: string,
    input: { price_id: string; quantity: number; coupon_code?: string; success_url?: string; cancel_url?: string }
  ): Promise<{ checkout_url: string }> {
    const price = await this.loadPrice(input.price_id);
    const customerId = await this.ensureStripeCustomer(orgId);
    const isSubscription = price.interval === 'month' || price.interval === 'year';

    const lineItem = price.stripe_price_id
      ? { price: price.stripe_price_id, quantity: input.quantity }
      : {
          quantity: input.quantity,
          price_data: {
            currency: price.currency.toLowerCase(),
            unit_amount: price.amount,
            product_data: { name: `${price.product_name} — ${price.plan_name}` },
            ...(isSubscription ? { recurring: { interval: price.interval } } : {}),
          },
        };

    let discounts: Array<Record<string, unknown>> | undefined;
    if (input.coupon_code) {
      const coupons = await this.sql<{ stripe_coupon_id: string | null }[]>`
        SELECT stripe_coupon_id FROM coupons
        WHERE code = ${input.coupon_code} AND status = 'active'
          AND (expires_at IS NULL OR expires_at > NOW())
          AND (max_redemptions IS NULL OR redemption_count < max_redemptions)
        LIMIT 1`;
      if (!coupons[0]?.stripe_coupon_id) {
        throw ApiError.badRequest('invalid_coupon', 'Coupon code is invalid or expired');
      }
      discounts = [{ coupon: coupons[0].stripe_coupon_id }];
    }

    const session = await this.deps.stripe.createCheckoutSession({
      mode: isSubscription ? 'subscription' : 'payment',
      customer: customerId,
      line_items: [lineItem],
      ...(discounts ? { discounts } : {}),
      ...(isSubscription && price.trial_days > 0
        ? { subscription_data: { trial_period_days: price.trial_days } }
        : {}),
      success_url: input.success_url ?? `${this.deps.dashboardUrl}/billing?checkout=success`,
      cancel_url: input.cancel_url ?? `${this.deps.dashboardUrl}/billing?checkout=cancelled`,
      metadata: {
        organization_id: orgId,
        price_id: price.id,
        plan_id: price.plan_id,
        product_id: price.product_id,
        quantity: String(input.quantity),
      },
    });
    return { checkout_url: session.url };
  }

  async createPortal(orgId: string): Promise<{ portal_url: string }> {
    const customerId = await this.ensureStripeCustomer(orgId);
    const session = await this.deps.stripe.createBillingPortalSession({
      customer: customerId,
      return_url: `${this.deps.dashboardUrl}/billing`,
    });
    return { portal_url: session.url };
  }

  async listSubscriptions(orgId: string) {
    return this.sql`
      SELECT s.id, s.status, s.current_period_end, s.cancel_at_period_end, s.created_at,
             COALESCE(
               (SELECT json_agg(json_build_object(
                  'product', p.slug, 'product_name', p.name,
                  'plan', pl.slug, 'plan_name', pl.name, 'quantity', si.quantity))
                FROM subscription_items si
                JOIN products p ON p.id = si.product_id
                JOIN plans pl ON pl.id = si.plan_id
                WHERE si.subscription_id = s.id),
               '[]'::json) AS items
      FROM subscriptions s
      WHERE s.organization_id = ${orgId}
      ORDER BY s.created_at DESC`;
  }

  async cancelSubscription(orgId: string, subscriptionId: string) {
    const rows = await this.sql<{ stripe_subscription_id: string | null; status: string }[]>`
      SELECT stripe_subscription_id, status FROM subscriptions
      WHERE id = ${subscriptionId} AND organization_id = ${orgId} LIMIT 1`;
    const sub = rows[0];
    if (!sub) throw ApiError.notFound('Subscription');
    if (sub.status === 'cancelled') throw ApiError.conflict('already_cancelled', 'Subscription is already cancelled');

    if (sub.stripe_subscription_id) {
      await this.deps.stripe.cancelAtPeriodEnd(sub.stripe_subscription_id);
    }
    const updated = await this.sql`
      UPDATE subscriptions SET cancel_at_period_end = TRUE, cancelled_at = NOW()
      WHERE id = ${subscriptionId}
      RETURNING id, status, current_period_end, cancel_at_period_end`;
    await this.events.publish('subscription.cancelled', { org_id: orgId, subscription_id: subscriptionId });
    return updated[0];
  }

  async listInvoices(orgId: string) {
    return this.sql`
      SELECT id, amount_due, amount_paid, currency, status, pdf_url, due_date, paid_at, created_at
      FROM invoices WHERE organization_id = ${orgId}
      ORDER BY created_at DESC LIMIT 100`;
  }

  // -------------------------------------------------------------------------
  // Stripe webhooks
  // -------------------------------------------------------------------------

  /** Returns false when the event was already processed (idempotent replay). */
  async recordWebhookEvent(stripeEventId: string, eventType: string, payload: unknown, signature: string | null): Promise<boolean> {
    const rows = await this.sql`
      INSERT INTO webhook_events (event_type, provider, provider_event_id, payload, signature)
      VALUES (${eventType}, 'stripe', ${stripeEventId}, ${this.sql.json(payload as never)}, ${signature})
      ON CONFLICT (provider, provider_event_id) DO NOTHING
      RETURNING id`;
    return rows.length > 0;
  }

  async markWebhookProcessed(stripeEventId: string, error?: string): Promise<void> {
    await this.sql`
      UPDATE webhook_events
      SET processed_at = ${error ? null : this.sql`NOW()`},
          error_message = ${error ?? null},
          retry_count = retry_count + ${error ? 1 : 0}
      WHERE provider = 'stripe' AND provider_event_id = ${stripeEventId}`;
  }

  async processWebhookEvent(eventType: string, object: Record<string, unknown>): Promise<void> {
    switch (eventType) {
      case 'checkout.session.completed':
        await this.onCheckoutCompleted(object);
        break;
      case 'invoice.paid':
        await this.onInvoicePaid(object);
        break;
      case 'invoice.payment_failed':
        await this.onInvoicePaymentFailed(object);
        break;
      case 'customer.subscription.updated':
        await this.onSubscriptionUpdated(object);
        break;
      case 'customer.subscription.deleted':
        await this.onSubscriptionDeleted(object);
        break;
      default:
        break; // stored but unhandled — visible in webhook_events
    }
  }

  private async onCheckoutCompleted(session: Record<string, unknown>): Promise<void> {
    const metadata = (session.metadata ?? {}) as Record<string, string>;
    const orgId = metadata.organization_id;
    const priceId = metadata.price_id;
    if (!orgId || !priceId) return; // not one of ours

    const price = await this.loadPrice(priceId);
    const quantity = Math.max(1, parseInt(metadata.quantity ?? '1', 10) || 1);
    const stripeSubscriptionId = (session.subscription as string | null) ?? null;
    const stripeCustomerId = (session.customer as string | null) ?? null;
    const isLifetime = price.interval === 'lifetime' || price.interval === null;

    const subscriptionId = await this.sql.begin(async (tx) => {
      const subRows = await tx<{ id: string }[]>`
        INSERT INTO subscriptions (organization_id, stripe_customer_id, stripe_subscription_id, status,
                                   current_period_start, current_period_end, metadata)
        VALUES (${orgId}, ${stripeCustomerId}, ${stripeSubscriptionId},
                ${isLifetime ? 'lifetime' : 'active'}, NOW(),
                ${isLifetime ? null : this.periodEndFromInterval(price.interval)},
                ${tx.json({ checkout_session_id: session.id } as never)})
        ON CONFLICT (stripe_subscription_id) DO UPDATE SET status = EXCLUDED.status
        RETURNING id`;
      const subscriptionId = subRows[0]!.id;

      await tx`
        INSERT INTO subscription_items (subscription_id, product_id, plan_id, price_id, quantity)
        SELECT ${subscriptionId}, ${price.product_id}, ${price.plan_id}, ${price.id}, ${quantity}
        WHERE NOT EXISTS (
          SELECT 1 FROM subscription_items
          WHERE subscription_id = ${subscriptionId} AND product_id = ${price.product_id} AND plan_id = ${price.plan_id}
        )`;

      await tx`
        INSERT INTO orders (organization_id, subscription_id, stripe_checkout_session_id, status, total_amount, currency)
        VALUES (${orgId}, ${subscriptionId}, ${String(session.id)}, 'completed',
                ${(session.amount_total as number | null) ?? price.amount * quantity},
                ${String(session.currency ?? price.currency).toUpperCase()})
        ON CONFLICT DO NOTHING`;

      return subscriptionId;
    });

    // Plugin products get a license automatically; SaaS products rely on entitlements.
    if (price.product_type === 'plugin') {
      await this.deps.licenses.issue({
        organizationId: orgId,
        productId: price.product_id,
        planId: price.plan_id,
        subscriptionId,
        expiresAt: isLifetime ? null : this.periodEndFromInterval(price.interval, 3), // 3-day renewal buffer
      });
    }

    // Monthly AI credit allowance from the plan's entitlement, granted up front.
    const creditRows = await this.sql<{ value: number }[]>`
      SELECT pe.value::int AS value
      FROM plan_entitlements pe
      JOIN features f ON f.id = pe.feature_id
      WHERE pe.plan_id = ${price.plan_id} AND f.key = ${`${price.product_slug}.ai.monthly_credits`}
      LIMIT 1`;
    const monthlyCredits = creditRows[0]?.value ?? 0;
    if (monthlyCredits > 0) {
      await this.deps.credits.grant({
        organizationId: orgId,
        productId: price.product_id,
        amount: monthlyCredits,
        entryType: 'grant',
        referenceId: subscriptionId,
        description: `${price.product_name} ${price.plan_name} — included AI credits`,
      });
    }

    await this.deps.entitlements.invalidate(orgId);
    await this.events.publish('subscription.activated', {
      org_id: orgId,
      subscription_id: subscriptionId,
      plan_ids: [price.plan_id],
    });
    await this.events.publish('entitlements.changed', {
      org_id: orgId,
      product_id: price.product_id,
      version: Math.floor(Date.now() / 1000),
    });
  }

  private async onInvoicePaid(invoice: Record<string, unknown>): Promise<void> {
    const stripeSubscriptionId = (invoice.subscription as string | null) ?? null;
    const sub = stripeSubscriptionId ? await this.findByStripeSubscription(stripeSubscriptionId) : null;

    const periodEnd = this.extractPeriodEnd(invoice);
    if (sub) {
      await this.sql`
        UPDATE subscriptions
        SET status = CASE WHEN status IN ('past_due', 'grace_period') THEN 'active' ELSE status END,
            current_period_start = NOW(),
            current_period_end = COALESCE(${periodEnd}, current_period_end)
        WHERE id = ${sub.id}`;

      // Renew licenses attached to this subscription.
      await this.sql`
        UPDATE licenses
        SET status = 'active', renewed_at = NOW(),
            expires_at = ${periodEnd ? new Date(periodEnd.getTime() + 3 * 86400 * 1000) : null}
        WHERE subscription_id = ${sub.id} AND status IN ('active', 'expired')`;

      // Monthly credit renewal for every plan on the subscription.
      const creditGrants = await this.sql<Array<{ product_id: string; product_slug: string; product_name: string; value: number }>>`
        SELECT p.id AS product_id, p.slug AS product_slug, p.name AS product_name, pe.value::int AS value
        FROM subscription_items si
        JOIN products p ON p.id = si.product_id
        JOIN plan_entitlements pe ON pe.plan_id = si.plan_id
        JOIN features f ON f.id = pe.feature_id
        WHERE si.subscription_id = ${sub.id} AND f.key = p.slug || '.ai.monthly_credits' AND pe.value::int > 0`;
      for (const grant of creditGrants) {
        await this.deps.credits.grant({
          organizationId: sub.organization_id,
          productId: grant.product_id,
          amount: grant.value,
          entryType: 'renewal',
          referenceId: String(invoice.id),
          description: `${grant.product_name} — monthly AI credit renewal`,
        });
      }

      await this.deps.entitlements.invalidate(sub.organization_id);
      await this.events.publish('entitlements.changed', {
        org_id: sub.organization_id,
        product_id: null,
        version: Math.floor(Date.now() / 1000),
      });
    }

    if (sub) {
      await this.sql`
        INSERT INTO invoices (organization_id, subscription_id, stripe_invoice_id, amount_due, amount_paid,
                              currency, status, pdf_url, paid_at)
        VALUES (${sub.organization_id}, ${sub.id}, ${String(invoice.id)},
                ${(invoice.amount_due as number) ?? 0}, ${(invoice.amount_paid as number) ?? 0},
                ${String(invoice.currency ?? 'usd').toUpperCase()}, 'paid',
                ${(invoice.invoice_pdf as string | null) ?? null}, NOW())
        ON CONFLICT (stripe_invoice_id) DO UPDATE
          SET amount_paid = EXCLUDED.amount_paid, status = 'paid', paid_at = NOW(), pdf_url = EXCLUDED.pdf_url`;
    }
  }

  private async onInvoicePaymentFailed(invoice: Record<string, unknown>): Promise<void> {
    const stripeSubscriptionId = (invoice.subscription as string | null) ?? null;
    if (!stripeSubscriptionId) return;
    const sub = await this.findByStripeSubscription(stripeSubscriptionId);
    if (!sub) return;

    const graceEnd = new Date(Date.now() + 7 * 86400 * 1000);
    await this.sql`UPDATE subscriptions SET status = 'past_due' WHERE id = ${sub.id}`;
    await this.sql`
      INSERT INTO invoices (organization_id, subscription_id, stripe_invoice_id, amount_due, amount_paid, currency, status)
      VALUES (${sub.organization_id}, ${sub.id}, ${String(invoice.id)},
              ${(invoice.amount_due as number) ?? 0}, ${(invoice.amount_paid as number) ?? 0},
              ${String(invoice.currency ?? 'usd').toUpperCase()}, 'open')
      ON CONFLICT (stripe_invoice_id) DO UPDATE SET status = 'open'`;
    await this.events.publish('subscription.past_due', {
      org_id: sub.organization_id,
      subscription_id: sub.id,
      grace_period_end: graceEnd.toISOString(),
    });
  }

  private async onSubscriptionUpdated(subscription: Record<string, unknown>): Promise<void> {
    const sub = await this.findByStripeSubscription(String(subscription.id));
    if (!sub) return;

    const stripeStatus = String(subscription.status ?? 'active');
    const statusMap: Record<string, string> = {
      active: 'active',
      trialing: 'trialing',
      past_due: 'past_due',
      paused: 'paused',
      canceled: 'cancelled',
      unpaid: 'grace_period',
      incomplete: 'past_due',
      incomplete_expired: 'expired',
    };
    const periodEnd = typeof subscription.current_period_end === 'number'
      ? new Date(subscription.current_period_end * 1000)
      : null;

    await this.sql`
      UPDATE subscriptions
      SET status = ${statusMap[stripeStatus] ?? 'active'},
          current_period_end = COALESCE(${periodEnd}, current_period_end),
          cancel_at_period_end = ${Boolean(subscription.cancel_at_period_end)}
      WHERE id = ${sub.id}`;

    await this.deps.entitlements.invalidate(sub.organization_id);
    await this.events.publish('entitlements.changed', {
      org_id: sub.organization_id,
      product_id: null,
      version: Math.floor(Date.now() / 1000),
    });
  }

  private async onSubscriptionDeleted(subscription: Record<string, unknown>): Promise<void> {
    const sub = await this.findByStripeSubscription(String(subscription.id));
    if (!sub) return;

    await this.sql`
      UPDATE subscriptions SET status = 'cancelled', ended_at = NOW() WHERE id = ${sub.id}`;
    await this.sql`
      UPDATE licenses SET status = 'expired'
      WHERE subscription_id = ${sub.id} AND status = 'active'`;

    await this.deps.entitlements.invalidate(sub.organization_id);
    await this.events.publish('subscription.cancelled', {
      org_id: sub.organization_id,
      subscription_id: sub.id,
    });
    await this.events.publish('entitlements.changed', {
      org_id: sub.organization_id,
      product_id: null,
      version: Math.floor(Date.now() / 1000),
    });
  }

  // -------------------------------------------------------------------------

  private async findByStripeSubscription(stripeSubscriptionId: string): Promise<{ id: string; organization_id: string } | null> {
    const rows = await this.sql<{ id: string; organization_id: string }[]>`
      SELECT id, organization_id FROM subscriptions
      WHERE stripe_subscription_id = ${stripeSubscriptionId} LIMIT 1`;
    return rows[0] ?? null;
  }

  private periodEndFromInterval(interval: string | null, bufferDays = 0): Date | null {
    if (interval === 'month') return new Date(Date.now() + (31 + bufferDays) * 86400 * 1000);
    if (interval === 'year') return new Date(Date.now() + (366 + bufferDays) * 86400 * 1000);
    return null;
  }

  private extractPeriodEnd(invoice: Record<string, unknown>): Date | null {
    const lines = (invoice.lines as { data?: Array<{ period?: { end?: number } }> } | undefined)?.data;
    const end = lines?.[0]?.period?.end;
    return typeof end === 'number' ? new Date(end * 1000) : null;
  }
}

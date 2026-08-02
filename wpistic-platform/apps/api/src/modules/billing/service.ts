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
import type { DomainEvent } from '@wpistic/types';
import { ApiError } from '../../errors';
import type { EventBus } from '../../events/bus';
import { writeOutboxEvent } from '../../events/outbox';
import { StripeClient } from './stripe';
import { CreditService } from '../ai-credits/service';
import { LicenseService } from '../licenses/service';
import { EntitlementService } from '../entitlements/service';

/** Stripe subscription statuses this platform explicitly understands. Anything else falls back to `paused` — never `active` — so an unrecognized status never grants entitlements by accident. */
const STRIPE_STATUS_MAP: Record<string, string> = {
  active: 'active',
  trialing: 'trialing',
  past_due: 'past_due',
  paused: 'paused',
  canceled: 'cancelled',
  unpaid: 'grace_period',
  incomplete: 'past_due',
  incomplete_expired: 'expired',
};

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
        ...(input.coupon_code ? { coupon_code: input.coupon_code } : {}),
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

  /** Undo a pending cancellation before the paid period ends — resumes access (spec 8.3). */
  async reactivateSubscription(orgId: string, subscriptionId: string) {
    const rows = await this.sql<
      Array<{ id: string; stripe_subscription_id: string | null; cancel_at_period_end: boolean; ended_at: string | null }>
    >`
      SELECT id, stripe_subscription_id, cancel_at_period_end, ended_at FROM subscriptions
      WHERE id = ${subscriptionId} AND organization_id = ${orgId} LIMIT 1`;
    const sub = rows[0];
    if (!sub) throw ApiError.notFound('Subscription');
    if (sub.ended_at) throw ApiError.conflict('subscription_ended', 'This subscription has already ended — start a new checkout instead');
    if (!sub.cancel_at_period_end) throw ApiError.conflict('not_cancelling', 'Subscription is not scheduled to cancel');

    if (sub.stripe_subscription_id) {
      await this.deps.stripe.resumeSubscription(sub.stripe_subscription_id);
    }
    const updated = await this.sql`
      UPDATE subscriptions SET cancel_at_period_end = FALSE, cancelled_at = NULL
      WHERE id = ${subscriptionId}
      RETURNING id, status, current_period_end, cancel_at_period_end`;

    await this.deps.entitlements.invalidate(orgId);
    await this.events.publish('entitlements.changed', { org_id: orgId, product_id: null, version: Math.floor(Date.now() / 1000) });
    return updated[0];
  }

  /** Prorated plan change — updates Stripe (if live), then recalculates entitlements immediately (spec 8.3). */
  async upgradeSubscription(orgId: string, subscriptionId: string, newPriceId: string) {
    const subs = await this.sql<Array<{ id: string; stripe_subscription_id: string | null; status: string }>>`
      SELECT id, stripe_subscription_id, status FROM subscriptions WHERE id = ${subscriptionId} AND organization_id = ${orgId} LIMIT 1`;
    const sub = subs[0];
    if (!sub) throw ApiError.notFound('Subscription');
    if (sub.status === 'cancelled' || sub.status === 'expired') {
      throw ApiError.conflict('subscription_inactive', 'Cannot change plan on an inactive subscription');
    }

    const newPrice = await this.loadPrice(newPriceId);
    const items = await this.sql<Array<{ id: string; stripe_subscription_item_id: string | null }>>`
      SELECT id, stripe_subscription_item_id FROM subscription_items WHERE subscription_id = ${subscriptionId} LIMIT 1`;
    const item = items[0];
    if (!item) throw ApiError.notFound('Subscription item');

    if (sub.stripe_subscription_id && newPrice.stripe_price_id) {
      let stripeItemId = item.stripe_subscription_item_id;
      if (!stripeItemId) {
        // Never backfilled at checkout time — resolve it live and cache it for next time.
        const liveSub = await this.deps.stripe.getSubscription(sub.stripe_subscription_id);
        const liveItems = (liveSub.items as { data?: Array<{ id: string }> } | undefined)?.data;
        stripeItemId = liveItems?.[0]?.id ?? null;
        if (stripeItemId) {
          await this.sql`UPDATE subscription_items SET stripe_subscription_item_id = ${stripeItemId} WHERE id = ${item.id}`;
        }
      }
      if (!stripeItemId) throw new ApiError(500, 'internal_error', 'Could not resolve the Stripe subscription item to upgrade');
      await this.deps.stripe.updateSubscriptionItemPrice(sub.stripe_subscription_id, stripeItemId, newPrice.stripe_price_id);
    }

    await this.sql`
      UPDATE subscription_items SET plan_id = ${newPrice.plan_id}, price_id = ${newPrice.id}, product_id = ${newPrice.product_id}
      WHERE id = ${item.id}`;

    await this.deps.entitlements.invalidate(orgId);
    await this.events.publish('entitlements.changed', {
      org_id: orgId,
      product_id: newPrice.product_id,
      version: Math.floor(Date.now() / 1000),
    });
    return { subscription_id: subscriptionId, plan_id: newPrice.plan_id };
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

  /**
   * Returns true when the event still needs processing. The raw row is
   * stored unconditionally on the first sighting (idempotent insert), but
   * whether to (re)run `processWebhookEvent` is decided by `processed_at`,
   * not row existence — a row that exists because a prior attempt failed
   * partway through must still be reprocessed on retry/replay, otherwise a
   * failure permanently freezes that event as "duplicate, skip".
   */
  async recordWebhookEvent(stripeEventId: string, eventType: string, payload: unknown, signature: string | null): Promise<boolean> {
    const inserted = await this.sql<{ id: string }[]>`
      INSERT INTO webhook_events (event_type, provider, provider_event_id, payload, signature)
      VALUES (${eventType}, 'stripe', ${stripeEventId}, ${this.sql.json(payload as never)}, ${signature})
      ON CONFLICT (provider, provider_event_id) DO NOTHING
      RETURNING id`;
    if (inserted.length > 0) return true;

    const existing = await this.sql<{ processed_at: string | null }[]>`
      SELECT processed_at FROM webhook_events WHERE provider = 'stripe' AND provider_event_id = ${stripeEventId} LIMIT 1`;
    return existing[0]?.processed_at == null;
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

      const orderRows = await tx<{ id: string }[]>`
        INSERT INTO orders (organization_id, subscription_id, stripe_checkout_session_id, status, total_amount, currency)
        SELECT ${orgId}, ${subscriptionId}, ${String(session.id)}, 'completed',
                ${(session.amount_total as number | null) ?? price.amount * quantity},
                ${String(session.currency ?? price.currency).toUpperCase()}
        WHERE NOT EXISTS (SELECT 1 FROM orders WHERE stripe_checkout_session_id = ${String(session.id)})
        RETURNING id`;
      const isNewOrder = orderRows.length > 0;

      // Transactional redemption counter — only when this checkout session's
      // order is genuinely new, so a webhook retry/replay never double-counts.
      if (isNewOrder && metadata.coupon_code) {
        await tx`UPDATE coupons SET redemption_count = redemption_count + 1 WHERE code = ${metadata.coupon_code}`;
      }

      await writeOutboxEvent<Extract<DomainEvent, { type: 'subscription.activated' }>>(
        tx,
        'subscription.activated',
        { org_id: orgId, subscription_id: subscriptionId, plan_ids: [price.plan_id] },
        orgId
      );
      await writeOutboxEvent<Extract<DomainEvent, { type: 'entitlements.changed' }>>(
        tx,
        'entitlements.changed',
        { org_id: orgId, product_id: price.product_id, version: Math.floor(Date.now() / 1000) },
        orgId
      );

      return subscriptionId;
    });

    // Plugin products get a license automatically; SaaS products rely on
    // entitlements. Guarded so a webhook retry/replay never issues a second
    // license for the same subscription+product (spec 8.1).
    if (price.product_type === 'plugin') {
      const existingLicense = await this.sql<{ id: string }[]>`
        SELECT id FROM licenses WHERE subscription_id = ${subscriptionId} AND product_id = ${price.product_id} LIMIT 1`;
      if (!existingLicense[0]) {
        await this.deps.licenses.issue({
          organizationId: orgId,
          productId: price.product_id,
          planId: price.plan_id,
          subscriptionId,
          expiresAt: isLifetime ? null : this.periodEndFromInterval(price.interval, 3), // 3-day renewal buffer
        });
      }
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

      // Renew licenses attached to this subscription — a successful payment
      // always clears any grace period a prior failed payment had started.
      await this.sql`
        UPDATE licenses
        SET status = 'active', renewed_at = NOW(), grace_period_ends_at = NULL,
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
      await this.sql.begin((tx) =>
        writeOutboxEvent<Extract<DomainEvent, { type: 'entitlements.changed' }>>(
          tx,
          'entitlements.changed',
          { org_id: sub.organization_id, product_id: null, version: Math.floor(Date.now() / 1000) },
          sub.organization_id
        )
      );
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

  /**
   * A failed payment immediately puts every license on this subscription
   * into its 7-day grace period (spec 8.2) — the same server-side truth
   * `evaluateLicenseLifecycle` (licenses/service.ts) reads everywhere else:
   * `expires_at` moves to now, `grace_period_ends_at` to now+7d, so the
   * license reads as `grace_period` (still usable) until that deadline.
   */
  private async onInvoicePaymentFailed(invoice: Record<string, unknown>): Promise<void> {
    const stripeSubscriptionId = (invoice.subscription as string | null) ?? null;
    if (!stripeSubscriptionId) return;
    const sub = await this.findByStripeSubscription(stripeSubscriptionId);
    if (!sub) return;

    const graceEnd = new Date(Date.now() + 7 * 86400 * 1000);
    await this.sql.begin(async (tx) => {
      await tx`UPDATE subscriptions SET status = 'past_due' WHERE id = ${sub.id}`;
      await tx`
        UPDATE licenses SET expires_at = NOW(), grace_period_ends_at = ${graceEnd}
        WHERE subscription_id = ${sub.id} AND status = 'active' AND (expires_at IS NULL OR expires_at > NOW())`;
      await tx`
        INSERT INTO invoices (organization_id, subscription_id, stripe_invoice_id, amount_due, amount_paid, currency, status)
        VALUES (${sub.organization_id}, ${sub.id}, ${String(invoice.id)},
                ${(invoice.amount_due as number) ?? 0}, ${(invoice.amount_paid as number) ?? 0},
                ${String(invoice.currency ?? 'usd').toUpperCase()}, 'open')
        ON CONFLICT (stripe_invoice_id) DO UPDATE SET status = 'open'`;
      await writeOutboxEvent<Extract<DomainEvent, { type: 'subscription.past_due' }>>(
        tx,
        'subscription.past_due',
        { org_id: sub.organization_id, subscription_id: sub.id, grace_period_end: graceEnd.toISOString() },
        sub.organization_id
      );
    });
  }

  private async onSubscriptionUpdated(subscription: Record<string, unknown>): Promise<void> {
    const sub = await this.findByStripeSubscription(String(subscription.id));
    if (!sub) return;

    const stripeStatus = String(subscription.status ?? 'active');
    const periodEnd = typeof subscription.current_period_end === 'number'
      ? new Date(subscription.current_period_end * 1000)
      : null;

    await this.sql.begin(async (tx) => {
      await tx`
        UPDATE subscriptions
        SET status = ${STRIPE_STATUS_MAP[stripeStatus] ?? 'paused'},
            current_period_end = COALESCE(${periodEnd}, current_period_end),
            cancel_at_period_end = ${Boolean(subscription.cancel_at_period_end)}
        WHERE id = ${sub.id}`;
      await writeOutboxEvent<Extract<DomainEvent, { type: 'entitlements.changed' }>>(
        tx,
        'entitlements.changed',
        { org_id: sub.organization_id, product_id: null, version: Math.floor(Date.now() / 1000) },
        sub.organization_id
      );
    });
    await this.deps.entitlements.invalidate(sub.organization_id);
  }

  private async onSubscriptionDeleted(subscription: Record<string, unknown>): Promise<void> {
    const sub = await this.findByStripeSubscription(String(subscription.id));
    if (!sub) return;

    await this.sql.begin(async (tx) => {
      await tx`UPDATE subscriptions SET status = 'cancelled', ended_at = NOW() WHERE id = ${sub.id}`;
      await tx`
        UPDATE licenses SET status = 'expired'
        WHERE subscription_id = ${sub.id} AND status = 'active'`;
      await writeOutboxEvent<Extract<DomainEvent, { type: 'subscription.cancelled' }>>(
        tx,
        'subscription.cancelled',
        { org_id: sub.organization_id, subscription_id: sub.id },
        sub.organization_id
      );
      await writeOutboxEvent<Extract<DomainEvent, { type: 'entitlements.changed' }>>(
        tx,
        'entitlements.changed',
        { org_id: sub.organization_id, product_id: null, version: Math.floor(Date.now() / 1000) },
        sub.organization_id
      );
    });
    await this.deps.entitlements.invalidate(sub.organization_id);
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

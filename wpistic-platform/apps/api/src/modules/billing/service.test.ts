/**
 * Tests for the billing hardening fixes (spec 8): webhook idempotency that
 * actually allows retrying a failed event, no duplicate license issuance on
 * replay, unknown Stripe statuses never defaulting to active, and grace
 * period application on payment failure.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockSql, createMockEventBus, testData } from '../../test/setup';
import { BillingService, type BillingDeps } from './service';

function makeDeps(overrides: Partial<BillingDeps> = {}): BillingDeps {
  return {
    stripe: {
      createCustomer: vi.fn(),
      createCheckoutSession: vi.fn(),
      createBillingPortalSession: vi.fn(),
      getSubscription: vi.fn(),
      cancelAtPeriodEnd: vi.fn(),
      resumeSubscription: vi.fn(),
      updateSubscriptionItemPrice: vi.fn(),
    } as any,
    licenses: { issue: vi.fn(async () => ({ licenseId: 'lic-new', rawKey: 'testprod_' + 'a'.repeat(32), mask: 'x' })) } as any,
    credits: { grant: vi.fn() } as any,
    entitlements: { invalidate: vi.fn() } as any,
    dashboardUrl: 'https://app.wpistic.com',
    ...overrides,
  };
}

function priceRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'price-1',
    plan_id: testData.uuids.plan,
    stripe_price_id: 'price_stripe_1',
    amount: 1000,
    currency: 'usd',
    interval: 'month',
    trial_days: 0,
    plan_slug: 'pro',
    plan_name: 'Pro',
    product_id: testData.uuids.product,
    product_slug: 'testprod',
    product_name: 'Test Product',
    product_type: 'plugin',
    ...overrides,
  };
}

describe('BillingService.recordWebhookEvent', () => {
  let mockSql: any;
  let service: BillingService;

  beforeEach(() => {
    mockSql = createMockSql();
    service = new BillingService(mockSql, createMockEventBus() as any, makeDeps());
  });

  it('returns true for a brand-new event', async () => {
    mockSql.mockResolvedValueOnce([{ id: 'we-1' }]);
    expect(await service.recordWebhookEvent('evt_1', 'checkout.session.completed', {}, 'sig')).toBe(true);
  });

  it('returns false once the event has already been successfully processed', async () => {
    mockSql.mockResolvedValueOnce([]); // insert no-ops on conflict
    mockSql.mockResolvedValueOnce([{ processed_at: new Date().toISOString() }]);
    expect(await service.recordWebhookEvent('evt_1', 'checkout.session.completed', {}, 'sig')).toBe(false);
  });

  it('returns true to allow reprocessing an event whose prior attempt failed (processed_at still null)', async () => {
    mockSql.mockResolvedValueOnce([]); // insert no-ops on conflict — row already existed
    mockSql.mockResolvedValueOnce([{ processed_at: null }]); // but never finished successfully
    expect(await service.recordWebhookEvent('evt_1', 'checkout.session.completed', {}, 'sig')).toBe(true);
  });
});

describe('BillingService.processWebhookEvent — checkout.session.completed', () => {
  let mockSql: any;

  beforeEach(() => {
    mockSql = createMockSql();
  });

  function session() {
    return {
      id: 'cs_test_1',
      subscription: 'sub_stripe_1',
      customer: 'cus_1',
      amount_total: 1000,
      currency: 'usd',
      metadata: {
        organization_id: testData.uuids.org,
        price_id: 'price-1',
        plan_id: testData.uuids.plan,
        product_id: testData.uuids.product,
        quantity: '1',
      },
    };
  }

  it('does not issue a second license when one already exists for this subscription+product (replay safety)', async () => {
    const deps = makeDeps();
    const service = new BillingService(mockSql, createMockEventBus() as any, deps);

    mockSql.mockResolvedValueOnce([priceRow()]); // loadPrice
    mockSql.mockResolvedValueOnce([{ id: 'sub-row-1' }]); // INSERT subscriptions
    mockSql.mockResolvedValueOnce([]); // INSERT subscription_items
    mockSql.mockResolvedValueOnce([{ id: 'order-1' }]); // INSERT orders (new order)
    mockSql.mockResolvedValueOnce([]); // outbox: subscription.activated
    mockSql.mockResolvedValueOnce([]); // outbox: entitlements.changed
    mockSql.mockResolvedValueOnce([{ id: 'existing-license' }]); // license already exists
    mockSql.mockResolvedValueOnce([]); // credit rows lookup

    await service.processWebhookEvent('checkout.session.completed', session());

    expect(deps.licenses.issue).not.toHaveBeenCalled();
  });

  it('issues exactly one license when none exists yet', async () => {
    const deps = makeDeps();
    const service = new BillingService(mockSql, createMockEventBus() as any, deps);

    mockSql.mockResolvedValueOnce([priceRow()]);
    mockSql.mockResolvedValueOnce([{ id: 'sub-row-1' }]);
    mockSql.mockResolvedValueOnce([]);
    mockSql.mockResolvedValueOnce([{ id: 'order-1' }]);
    mockSql.mockResolvedValueOnce([]);
    mockSql.mockResolvedValueOnce([]);
    mockSql.mockResolvedValueOnce([]); // no existing license
    mockSql.mockResolvedValueOnce([]); // credit rows lookup

    await service.processWebhookEvent('checkout.session.completed', session());

    expect(deps.licenses.issue).toHaveBeenCalledTimes(1);
  });

  it('increments the coupon redemption counter only when the order is genuinely new', async () => {
    const deps = makeDeps();
    const service = new BillingService(mockSql, createMockEventBus() as any, deps);
    const sessionWithCoupon = { ...session(), metadata: { ...session().metadata, coupon_code: 'SAVE20' } };

    mockSql.mockResolvedValueOnce([priceRow({ product_type: 'saas' })]);
    mockSql.mockResolvedValueOnce([{ id: 'sub-row-1' }]);
    mockSql.mockResolvedValueOnce([]);
    mockSql.mockResolvedValueOnce([]); // orders insert finds an existing row already — NOT new
    mockSql.mockResolvedValueOnce([]); // outbox
    mockSql.mockResolvedValueOnce([]); // outbox
    mockSql.mockResolvedValueOnce([]); // credit rows lookup (product_type saas skips license issuance)

    await service.processWebhookEvent('checkout.session.completed', sessionWithCoupon);

    const couponCall = mockSql.mock.calls.find((c: unknown[]) => (c[0] as string[]).join('').includes('redemption_count'));
    expect(couponCall).toBeUndefined();
  });
});

describe('BillingService.processWebhookEvent — customer.subscription.updated', () => {
  it('defaults an unrecognized Stripe status to paused, never active', async () => {
    const mockSql: any = createMockSql();
    const deps = makeDeps();
    const service = new BillingService(mockSql, createMockEventBus() as any, deps);

    mockSql.mockResolvedValueOnce([{ id: 'sub-1', organization_id: testData.uuids.org }]); // findByStripeSubscription
    mockSql.mockResolvedValueOnce([]); // UPDATE subscriptions
    mockSql.mockResolvedValueOnce([]); // outbox entitlements.changed

    await service.processWebhookEvent('customer.subscription.updated', {
      id: 'sub_stripe_1',
      status: 'some_future_stripe_status_we_have_never_seen',
    });

    const updateCall = mockSql.mock.calls[1];
    expect(updateCall).toContain('paused');
    expect(updateCall).not.toContain('active');
  });

  it('maps a known status (active) through normally', async () => {
    const mockSql: any = createMockSql();
    const deps = makeDeps();
    const service = new BillingService(mockSql, createMockEventBus() as any, deps);

    mockSql.mockResolvedValueOnce([{ id: 'sub-1', organization_id: testData.uuids.org }]);
    mockSql.mockResolvedValueOnce([]);
    mockSql.mockResolvedValueOnce([]);

    await service.processWebhookEvent('customer.subscription.updated', { id: 'sub_stripe_1', status: 'active' });

    expect(mockSql.mock.calls[1]).toContain('active');
  });
});

describe('BillingService.processWebhookEvent — invoice.payment_failed', () => {
  it('applies a 7-day grace period to active licenses on the subscription', async () => {
    const mockSql: any = createMockSql();
    const deps = makeDeps();
    const service = new BillingService(mockSql, createMockEventBus() as any, deps);

    mockSql.mockResolvedValueOnce([{ id: 'sub-1', organization_id: testData.uuids.org }]); // findByStripeSubscription
    mockSql.mockResolvedValueOnce([]); // UPDATE subscriptions past_due
    mockSql.mockResolvedValueOnce([]); // UPDATE licenses grace period
    mockSql.mockResolvedValueOnce([]); // INSERT invoices
    mockSql.mockResolvedValueOnce([]); // outbox subscription.past_due

    await service.processWebhookEvent('invoice.payment_failed', { id: 'in_1', subscription: 'sub_stripe_1', amount_due: 1000 });

    const licenseUpdateCall = mockSql.mock.calls.find((c: unknown[]) => (c[0] as string[]).join('').includes('grace_period_ends_at'));
    expect(licenseUpdateCall).toBeTruthy();
    expect(licenseUpdateCall!.join('')).toContain('expires_at = NOW()');
  });
});

describe('BillingService.reactivateSubscription', () => {
  it('rejects a subscription that already fully ended', async () => {
    const mockSql: any = createMockSql();
    const service = new BillingService(mockSql, createMockEventBus() as any, makeDeps());
    mockSql.mockResolvedValueOnce([{ id: 'sub-1', stripe_subscription_id: 's1', cancel_at_period_end: true, ended_at: new Date().toISOString() }]);

    await expect(service.reactivateSubscription(testData.uuids.org, 'sub-1')).rejects.toThrow(/already ended/i);
  });

  it('rejects a subscription that is not currently scheduled to cancel', async () => {
    const mockSql: any = createMockSql();
    const service = new BillingService(mockSql, createMockEventBus() as any, makeDeps());
    mockSql.mockResolvedValueOnce([{ id: 'sub-1', stripe_subscription_id: 's1', cancel_at_period_end: false, ended_at: null }]);

    await expect(service.reactivateSubscription(testData.uuids.org, 'sub-1')).rejects.toThrow(/not scheduled/i);
  });

  it('resumes on Stripe and clears cancel_at_period_end', async () => {
    const mockSql: any = createMockSql();
    const deps = makeDeps();
    const service = new BillingService(mockSql, createMockEventBus() as any, deps);
    mockSql.mockResolvedValueOnce([{ id: 'sub-1', stripe_subscription_id: 's1', cancel_at_period_end: true, ended_at: null }]);
    mockSql.mockResolvedValueOnce([{ id: 'sub-1', status: 'active', current_period_end: null, cancel_at_period_end: false }]);

    const result = await service.reactivateSubscription(testData.uuids.org, 'sub-1');

    expect(deps.stripe.resumeSubscription).toHaveBeenCalledWith('s1');
    expect(result?.cancel_at_period_end).toBe(false);
  });
});

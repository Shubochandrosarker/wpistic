/**
 * Tests for queue consumer hardening: event dedup, and per-subscription
 * webhook retry with the immediate/5min/15min schedule, ending in suspend
 * + notify (spec 7.3).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMockSql, createMockKV } from '../test/setup';
import { processBatch } from './handlers';

function envelope(overrides: Record<string, unknown> = {}) {
  return {
    id: 'evt_test1',
    type: 'license.activated',
    occurred_at: new Date().toISOString(),
    correlation_id: null,
    data: { license_id: 'lic-1', org_id: 'org-1', domain: 'example.com' },
    ...overrides,
  };
}

function makeMessage(body: unknown, attempts = 1) {
  return { body, attempts, ack: vi.fn(), retry: vi.fn() };
}

describe('handleQueueBatch webhook fan-out', () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('acks and does not retry when there are no matching webhook subscriptions', async () => {
    const mockSql: any = createMockSql();
    mockSql.mockResolvedValueOnce([]); // subscriptions query
    const kv = createMockKV();
    const env = { SESSION_CACHE: kv } as any;
    const message = makeMessage(envelope());

    await processBatch([message] as any, mockSql, env);

    expect(message.ack).toHaveBeenCalled();
    expect(message.retry).not.toHaveBeenCalled();
  });

  it('schedules a 5-minute retry after the first delivery failure, without suspending', async () => {
    globalThis.fetch = vi.fn(async () => new Response('error', { status: 500 })) as any;
    const mockSql: any = createMockSql();
    mockSql.mockResolvedValueOnce([
      { id: 'sub-1', organization_id: 'org-1', url: 'https://example.com/hook', signing_secret: 'secret', event_types: '[]', failure_count: 0 },
    ]);
    mockSql.mockResolvedValueOnce([]); // INSERT webhook_deliveries
    mockSql.mockResolvedValueOnce([]); // UPDATE webhook_subscriptions failure_count

    const env = { SESSION_CACHE: createMockKV() } as any;
    const message = makeMessage(envelope());

    await processBatch([message] as any, mockSql, env);

    expect(message.retry).toHaveBeenCalledWith({ delaySeconds: 300 });
    const suspendCall = mockSql.mock.calls.find((c: unknown[]) => (c[0] as string[]).join('').includes("status = 'suspended'"));
    expect(suspendCall).toBeUndefined();
  });

  it('suspends the subscription and stops retrying after the schedule is exhausted (3rd failure)', async () => {
    globalThis.fetch = vi.fn(async () => new Response('error', { status: 500 })) as any;
    const mockSql: any = createMockSql();
    mockSql.mockResolvedValueOnce([
      { id: 'sub-1', organization_id: 'org-1', url: 'https://example.com/hook', signing_secret: 'secret', event_types: '[]', failure_count: 2 },
    ]);
    mockSql.mockResolvedValueOnce([]); // INSERT webhook_deliveries
    mockSql.mockResolvedValueOnce([]); // UPDATE failure_count
    mockSql.mockResolvedValueOnce([]); // UPDATE status = suspended
    mockSql.mockResolvedValueOnce([]); // INSERT notifications (notifyOrgRoles)

    const kv = createMockKV();
    await kv.put('webhook_retry:evt_test1:sub-1', '2'); // two prior failed attempts already recorded
    const env = { SESSION_CACHE: kv } as any;
    const message = makeMessage(envelope());

    await processBatch([message] as any, mockSql, env);

    expect(message.retry).not.toHaveBeenCalled();
    expect(message.ack).toHaveBeenCalled();
    const suspendCall = mockSql.mock.calls.find((c: unknown[]) => (c[0] as string[]).join('').includes("status = 'suspended'"));
    expect(suspendCall).toBeTruthy();
  });

  it('does not deliver twice to a subscription already marked delivered for this event (dedup)', async () => {
    globalThis.fetch = vi.fn(async () => new Response('ok', { status: 200 })) as any;
    const mockSql: any = createMockSql();
    mockSql.mockResolvedValueOnce([
      { id: 'sub-1', organization_id: 'org-1', url: 'https://example.com/hook', signing_secret: 'secret', event_types: '[]', failure_count: 0 },
    ]);

    const kv = createMockKV();
    await kv.put('webhook_delivered:evt_test1:sub-1', '1');
    const env = { SESSION_CACHE: kv } as any;
    const message = makeMessage(envelope());

    await processBatch([message] as any, mockSql, env);

    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(message.ack).toHaveBeenCalled();
  });
});

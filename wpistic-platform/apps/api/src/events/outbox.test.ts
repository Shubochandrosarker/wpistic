/**
 * Tests for the transactional outbox publisher: events are not lost when
 * queue publishing fails (spec 7.4), and permanently-failed rows are
 * reported for dead-lettering rather than retried forever.
 */
import { describe, it, expect, vi } from 'vitest';
import { createMockSql } from '../test/setup';
import { publishOutboxBatch } from './outbox';

function outboxRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'outbox-1',
    event_type: 'license.activated',
    payload: { data: { license_id: 'lic-1', org_id: 'org-1', domain: 'example.com' } },
    attempts: 0,
    max_attempts: 3,
    created_at: '2026-08-02T12:00:00.000Z',
    ...overrides,
  };
}

function mockQueue(sendImpl: () => Promise<void>): Queue {
  return { send: vi.fn(sendImpl) } as unknown as Queue;
}

describe('publishOutboxBatch', () => {
  it('marks a successfully published row as processed', async () => {
    const mockSql: any = createMockSql();
    mockSql.mockResolvedValueOnce([outboxRow()]); // SELECT unprocessed
    mockSql.mockResolvedValueOnce([]); // UPDATE processed_at

    const queue = mockQueue(async () => undefined);
    const result = await publishOutboxBatch(mockSql, queue, vi.fn());

    expect(result.published).toBe(1);
    expect(result.exhausted).toBe(0);
    expect(queue.send).toHaveBeenCalledTimes(1);
    const updateCall = mockSql.mock.calls[1];
    expect(updateCall.join('')).toContain('processed_at');
  });

  it('does not lose the event when queue.send fails — increments attempts instead of dropping the row', async () => {
    const mockSql: any = createMockSql();
    mockSql.mockResolvedValueOnce([outboxRow({ attempts: 0, max_attempts: 3 })]);
    mockSql.mockResolvedValueOnce([]); // UPDATE attempts/error

    const queue = mockQueue(async () => {
      throw new Error('queue unavailable');
    });
    const onExhausted = vi.fn();
    const result = await publishOutboxBatch(mockSql, queue, onExhausted);

    expect(result.retried).toBe(1);
    expect(result.exhausted).toBe(0);
    expect(onExhausted).not.toHaveBeenCalled();
    const updateCall = mockSql.mock.calls[1];
    expect(updateCall).toContain(1); // attempts incremented to 1, row survives for the next cron tick
  });

  it('reports exhaustion (dead-letter) once max_attempts is reached, without silently dropping the row', async () => {
    const mockSql: any = createMockSql();
    mockSql.mockResolvedValueOnce([outboxRow({ attempts: 2, max_attempts: 3 })]);
    mockSql.mockResolvedValueOnce([]);

    const queue = mockQueue(async () => {
      throw new Error('permanently broken');
    });
    const onExhausted = vi.fn();
    const result = await publishOutboxBatch(mockSql, queue, onExhausted);

    expect(result.exhausted).toBe(1);
    expect(onExhausted).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'outbox-1', eventType: 'license.activated' })
    );
  });

  it('only selects rows that are unprocessed and under their attempt limit', async () => {
    const mockSql: any = createMockSql();
    mockSql.mockResolvedValueOnce([]);
    await publishOutboxBatch(mockSql, mockQueue(async () => undefined), vi.fn());

    const selectCall = mockSql.mock.calls[0][0].join('');
    expect(selectCall).toContain('processed_at IS NULL');
    expect(selectCall).toContain('attempts < max_attempts');
  });

  it('claims rows with FOR UPDATE SKIP LOCKED inside a transaction so concurrent crons cannot double-publish', async () => {
    const mockSql: any = createMockSql();
    mockSql.mockResolvedValueOnce([]);
    await publishOutboxBatch(mockSql, mockQueue(async () => undefined), vi.fn());

    expect(mockSql.begin).toHaveBeenCalledTimes(1);
    const selectCall = mockSql.mock.calls[0][0].join('');
    expect(selectCall).toContain('FOR UPDATE SKIP LOCKED');
  });

  it('derives a stable envelope id from the outbox row id so consumers can deduplicate retries', async () => {
    const rowId = '3f9b2c1e-4d5f-4a9b-8c0d-1e2f3a4b5c6d';
    const sendCalls: any[] = [];
    const queue = mockQueue(async () => undefined);
    (queue.send as any).mockImplementation(async (envelope: any) => {
      sendCalls.push(envelope);
    });

    // Two separate publish runs over the same row (e.g. crash before commit,
    // then redelivery) must produce the identical envelope id.
    for (let i = 0; i < 2; i++) {
      const mockSql: any = createMockSql();
      mockSql.mockResolvedValueOnce([outboxRow({ id: rowId, created_at: '2026-08-02T00:00:00.000Z' })]);
      mockSql.mockResolvedValueOnce([]);
      await publishOutboxBatch(mockSql, queue, vi.fn());
    }

    expect(sendCalls[0].id).toBe('evt_3f9b2c1e4d5f4a9b8c0d1e2f3a4b5c6d');
    expect(sendCalls[1].id).toBe(sendCalls[0].id);
    expect(sendCalls[0].occurred_at).toBe('2026-08-02T00:00:00.000Z');
  });
});

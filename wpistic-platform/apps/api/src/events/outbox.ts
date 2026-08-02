/**
 * Transactional outbox (spec 7): critical mutations (license activate,
 * deactivate, billing webhook effects) write their event into
 * `event_outbox` inside the SAME database transaction as the business
 * mutation, instead of calling EventBus.publish directly. A queue send can
 * fail independently of the mutation — writing both atomically means the
 * event is never silently lost even when EventBus.publish would have
 * swallowed the error.
 *
 * A Worker Cron Trigger (see index.ts `scheduled`, wrangler.jsonc `crons`)
 * runs `publishOutboxBatch` every minute to drain unprocessed rows onto the
 * real Cloudflare Queue.
 */
import type { Sql, TransactionSql } from 'postgres';
import type { DomainEvent, DomainEventType, EventEnvelope } from '@wpistic/types';

export async function writeOutboxEvent<T extends DomainEvent>(
  tx: TransactionSql,
  type: T['type'],
  data: T['data'],
  organizationId: string | null
): Promise<void> {
  await tx`
    INSERT INTO event_outbox (event_type, payload, organization_id)
    VALUES (${type}, ${tx.json({ data } as never)}, ${organizationId})`;
}

const OUTBOX_BATCH_SIZE = 50;

export interface OutboxPublishResult {
  published: number;
  retried: number;
  exhausted: number;
}

/** Drain unprocessed outbox rows onto the real queue. Idempotent to re-run — already-processed rows are excluded. */
export async function publishOutboxBatch(
  sql: Sql,
  queue: Queue,
  onExhausted: (row: { id: string; eventType: string; error: string }) => void
): Promise<OutboxPublishResult> {
  const rows = await sql<
    Array<{ id: string; event_type: string; payload: { data: unknown }; attempts: number; max_attempts: number }>
  >`
    SELECT id, event_type, payload, attempts, max_attempts
    FROM event_outbox
    WHERE processed_at IS NULL AND attempts < max_attempts
    ORDER BY created_at ASC
    LIMIT ${OUTBOX_BATCH_SIZE}`;

  const result: OutboxPublishResult = { published: 0, retried: 0, exhausted: 0 };

  for (const row of rows) {
    const envelope: EventEnvelope = {
      id: `evt_${crypto.randomUUID().replace(/-/g, '')}`,
      type: row.event_type as DomainEventType,
      occurred_at: new Date().toISOString(),
      correlation_id: null,
      data: row.payload.data as never,
    };

    try {
      await queue.send(envelope, { contentType: 'json' });
      await sql`UPDATE event_outbox SET processed_at = NOW() WHERE id = ${row.id}`;
      result.published++;
    } catch (err) {
      const attempts = row.attempts + 1;
      const errorMessage = String(err);
      await sql`UPDATE event_outbox SET attempts = ${attempts}, error = ${errorMessage} WHERE id = ${row.id}`;
      if (attempts >= row.max_attempts) {
        result.exhausted++;
        onExhausted({ id: row.id, eventType: row.event_type, error: errorMessage });
      } else {
        result.retried++;
      }
    }
  }

  return result;
}

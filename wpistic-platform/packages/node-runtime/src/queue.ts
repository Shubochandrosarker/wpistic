/**
 * Queue replacement.
 *
 * On Cloudflare, `EVENT_BUS.send()` hands an envelope to a managed queue and a
 * separate consumer invocation processes it with retries and a dead-letter
 * queue. On a VPS there is no such service, but the platform already has the
 * durable half of the pattern: critical mutations write to `event_outbox`
 * inside their own transaction, and a cron drains that table.
 *
 * So the Node queue is deliberately thin. `send()` writes to the outbox rather
 * than dispatching inline, which means:
 *
 *  - an event survives a crash between the mutation committing and the handler
 *    running, because it is a committed row rather than a value in memory;
 *  - retries and dead-lettering are the outbox's existing `attempts` /
 *    `max_attempts` logic, already tested, rather than a second mechanism; and
 *  - a slow webhook fan-out cannot delay the HTTP response that triggered it.
 *
 * The scheduler process drains the outbox and invokes the same
 * `handleQueueBatch` the Workers consumer uses, so both deployments run
 * identical handler code.
 */
import type { Sql } from 'postgres';

/** The subset of Cloudflare's Queue surface the platform calls. */
export interface EventQueue {
  send(message: unknown): Promise<void>;
  sendBatch(messages: Array<{ body: unknown }>): Promise<void>;
}

export function createOutboxQueue(sql: Sql): EventQueue {
  async function enqueue(message: unknown): Promise<void> {
    const envelope = message as { type?: string; data?: Record<string, unknown> };
    const eventType = envelope?.type;
    if (!eventType) {
      // A queue send with no type would be undrainable — the consumer switches
      // on it. Fail loudly at the producer rather than writing a poison row.
      throw new Error('Cannot enqueue an event without a type');
    }
    const orgId =
      typeof envelope.data?.org_id === 'string' ? (envelope.data.org_id as string) : null;

    await sql`
      INSERT INTO event_outbox (event_type, payload, organization_id)
      VALUES (${eventType}, ${sql.json({ data: envelope.data ?? {} } as never)}, ${orgId})`;
  }

  return {
    send: enqueue,
    async sendBatch(messages) {
      for (const message of messages) await enqueue(message.body);
    },
  };
}

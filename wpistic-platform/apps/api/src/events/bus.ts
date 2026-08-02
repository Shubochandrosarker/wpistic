/**
 * Cloudflare Queues publisher for domain events. Every mutation that changes
 * commercial state publishes here; consumers fan out to notifications, cache
 * invalidation, and signed product-app webhooks.
 */
import type { DomainEvent, EventEnvelope } from '@wpistic/types';

export class EventBus {
  constructor(
    private queue: Queue,
    private correlationId: string | null
  ) {}

  async publish<T extends DomainEvent>(type: T['type'], data: T['data']): Promise<void> {
    const envelope: EventEnvelope = {
      id: `evt_${crypto.randomUUID().replace(/-/g, '')}`,
      type,
      occurred_at: new Date().toISOString(),
      correlation_id: this.correlationId,
      data,
    };
    try {
      await this.queue.send(envelope, { contentType: 'json' });
    } catch (err) {
      // Event loss is logged loudly but never fails the user-facing mutation.
      console.error(
        JSON.stringify({ level: 'error', message: 'event publish failed', type, error: String(err) })
      );
    }
  }
}

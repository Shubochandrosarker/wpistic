/**
 * AI credit wallet. Append-only ledger — the balance is always the last
 * entry's balance_after, never a mutable column. Consumption is idempotent
 * per (organization, idempotency_key) and serialized with an advisory lock
 * so concurrent spends cannot double-deduct.
 */
import type { Sql } from 'postgres';
import { ApiError } from '../../errors';
import type { EventBus } from '../../events/bus';

export class CreditService {
  constructor(
    private sql: Sql,
    private events: EventBus
  ) {}

  async balance(orgId: string): Promise<{ organization_id: string; balance: number; updated_at: string }> {
    const rows = await this.sql<{ balance_after: number; created_at: string }[]>`
      SELECT balance_after, created_at FROM ai_credit_ledger
      WHERE organization_id = ${orgId}
      ORDER BY created_at DESC, id DESC LIMIT 1`;
    return {
      organization_id: orgId,
      balance: rows[0]?.balance_after ?? 0,
      updated_at: rows[0]?.created_at ?? new Date(0).toISOString(),
    };
  }

  async ledger(orgId: string, limit = 50) {
    return this.sql`
      SELECT id, product_id, entry_type, amount, balance_after, reference_id, description, created_at
      FROM ai_credit_ledger
      WHERE organization_id = ${orgId}
      ORDER BY created_at DESC, id DESC
      LIMIT ${Math.min(limit, 200)}`;
  }

  async grant(input: {
    organizationId: string;
    productId?: string | null;
    amount: number;
    entryType?: 'grant' | 'renewal' | 'refund' | 'adjustment';
    referenceId?: string | null;
    description?: string | null;
  }): Promise<number> {
    if (input.amount <= 0) throw ApiError.badRequest('invalid_amount', 'Grant amount must be positive');
    return this.append(
      input.organizationId,
      input.productId ?? null,
      input.entryType ?? 'grant',
      input.amount,
      input.referenceId ?? null,
      input.description ?? null,
      {}
    );
  }

  /**
   * Consume credits for a metered usage event. Returns the resulting balance.
   * Replays of the same idempotency key return the original outcome without
   * a second deduction.
   */
  async consume(input: {
    organizationId: string;
    productSlug: string;
    operation: string;
    units: number;
    idempotencyKey: string;
    metadata?: Record<string, unknown>;
  }): Promise<{ balance: number; duplicate: boolean }> {
    const products = await this.sql<{ id: string }[]>`
      SELECT id FROM products WHERE slug = ${input.productSlug} LIMIT 1`;
    const product = products[0];
    if (!product) throw ApiError.notFound('Product');

    const result = await this.sql.begin(async (tx) => {
      await tx`SELECT pg_advisory_xact_lock(hashtext(${`credits:${input.organizationId}`}))`;

      const inserted = await tx<{ id: string }[]>`
        INSERT INTO usage_events (organization_id, product_id, operation, units, idempotency_key, metadata)
        VALUES (${input.organizationId}, ${product.id}, ${input.operation}, ${input.units},
                ${input.idempotencyKey}, ${tx.json((input.metadata ?? {}) as never)})
        ON CONFLICT (organization_id, idempotency_key) DO NOTHING
        RETURNING id`;

      const balRows = await tx<{ balance_after: number }[]>`
        SELECT balance_after FROM ai_credit_ledger
        WHERE organization_id = ${input.organizationId}
        ORDER BY created_at DESC, id DESC LIMIT 1`;
      const current = balRows[0]?.balance_after ?? 0;

      if (inserted.length === 0) {
        return { balance: current, duplicate: true };
      }

      if (current < input.units) {
        throw ApiError.paymentRequired(
          'insufficient_credits',
          `Not enough AI credits (${current} available, ${input.units} required)`
        );
      }

      const newBalance = current - input.units;
      await tx`
        INSERT INTO ai_credit_ledger (organization_id, product_id, entry_type, amount, balance_after,
                                      reference_id, description, metadata)
        VALUES (${input.organizationId}, ${product.id}, 'consumption', ${-input.units}, ${newBalance},
                ${inserted[0]!.id}, ${input.operation}, ${tx.json((input.metadata ?? {}) as never)})`;
      return { balance: newBalance, duplicate: false };
    });

    if (!result.duplicate) {
      await this.events.publish('ai_credits.consumed', {
        org_id: input.organizationId,
        product: input.productSlug,
        units: input.units,
        balance_after: result.balance,
      });
    }
    return result;
  }

  private async append(
    orgId: string,
    productId: string | null,
    entryType: string,
    amount: number,
    referenceId: string | null,
    description: string | null,
    metadata: Record<string, unknown>
  ): Promise<number> {
    return this.sql.begin(async (tx) => {
      await tx`SELECT pg_advisory_xact_lock(hashtext(${`credits:${orgId}`}))`;
      const balRows = await tx<{ balance_after: number }[]>`
        SELECT balance_after FROM ai_credit_ledger
        WHERE organization_id = ${orgId}
        ORDER BY created_at DESC, id DESC LIMIT 1`;
      const newBalance = (balRows[0]?.balance_after ?? 0) + amount;
      await tx`
        INSERT INTO ai_credit_ledger (organization_id, product_id, entry_type, amount, balance_after,
                                      reference_id, description, metadata)
        VALUES (${orgId}, ${productId}, ${entryType}, ${amount}, ${newBalance},
                ${referenceId}, ${description}, ${tx.json(metadata as never)})`;
      return newBalance;
    }) as Promise<number>;
  }
}

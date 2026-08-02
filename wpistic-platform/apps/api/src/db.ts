import postgres from 'postgres';
import type { Sql, TransactionSql } from 'postgres';
import type { Env } from './env';

export function createDb(env: Env): Sql {
  return postgres(env.HYPERDRIVE.connectionString, {
    max: 5,
    fetch_types: false,
    prepare: false,
  });
}

/**
 * Run `fn` in a transaction with app.current_org_id set for the duration —
 * activates the Row Level Security safety-net policies (see migration 0010)
 * on top of the explicit organization_id filters every query already carries.
 */
export async function withOrg<T>(sql: Sql, orgId: string, fn: (tx: TransactionSql) => Promise<T>): Promise<T> {
  return sql.begin(async (tx) => {
    await tx`SELECT set_config('app.current_org_id', ${orgId}, true)`;
    return fn(tx);
  }) as Promise<T>;
}

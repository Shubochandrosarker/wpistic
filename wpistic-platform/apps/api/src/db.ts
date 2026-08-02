import postgres from 'postgres';
import type { Sql, TransactionSql } from 'postgres';
import type { Env } from './env';

/**
 * One client per request (created in index.ts, torn down via `sql.end()`
 * when the request finishes). `max: 1` pins every query in that request to
 * a single underlying connection. Tenant middleware therefore uses explicit
 * organization predicates; transaction-scoped RLS is available through
 * `withOrg()` when a query group needs the database safety net. Same-request
 * concurrent queries queue on that one connection, an acceptable cost at the
 * connection-pool sizes a single request needs.
 */
export function createDb(env: Env): Sql {
  return postgres(env.HYPERDRIVE.connectionString, {
    max: 1,
    fetch_types: false,
    prepare: false,
    idle_timeout: 20,
    connect_timeout: 5,
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

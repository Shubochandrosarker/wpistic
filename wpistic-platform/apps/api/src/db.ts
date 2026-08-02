import postgres from 'postgres';
import type { Sql, TransactionSql } from 'postgres';
import type { Env } from './env';

/**
 * One client per request (created in index.ts, torn down via `sql.end()`
 * when the request finishes). `max: 1` pins every query in that request to
 * a single underlying connection — required for `app.current_org_id`
 * (set per request in middleware/tenant.ts, see setOrgRlsContext) to apply
 * to every query, not just whichever one happens to grab that connection
 * from a multi-connection pool. The tradeoff is that same-request queries
 * issued concurrently (e.g. `Promise.all([...])`) queue on that one
 * connection instead of running in parallel — an acceptable cost for RLS
 * correctness at the connection-pool sizes a single request needs.
 */
export function createDb(env: Env): Sql {
  return postgres(env.HYPERDRIVE.connectionString, {
    max: 1,
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

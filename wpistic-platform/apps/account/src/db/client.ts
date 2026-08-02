import postgres from 'postgres';
import type { Sql } from 'postgres';
import type { Env } from '../env';

/**
 * Per-request postgres client over Hyperdrive. Hyperdrive pools upstream;
 * the Worker client stays small and is closed after the response via
 * executionCtx.waitUntil(sql.end()).
 */
export function createDb(env: Env): Sql {
  return postgres(env.HYPERDRIVE.connectionString, {
    max: 5,
    fetch_types: false,
    prepare: false,
  });
}

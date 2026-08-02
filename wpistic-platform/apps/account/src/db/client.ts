import postgres from 'postgres';
import type { Sql } from 'postgres';
import type { Env } from '../env';

/**
 * Per-request postgres client over Hyperdrive. Hyperdrive pools upstream;
 * the Worker client stays small and is closed by request middleware after the
 * response has been handled.
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

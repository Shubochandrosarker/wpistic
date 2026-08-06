/**
 * Postgres-backed key/value store presenting the Cloudflare KV surface.
 *
 * The application calls `c.env.SESSION_CACHE.get(...)` in about thirty places
 * and `PKCE_STORAGE` in six more. Rather than rewrite those against a new
 * abstraction — and re-test every one — this implements the same interface, so
 * the same application code runs unchanged on Workers or on a VPS.
 *
 * Two differences from real KV, both in the safer direction:
 *
 *  - **Reads are strongly consistent.** Cloudflare KV is eventually consistent,
 *    so a value written on one edge may not be visible from another for a few
 *    seconds. Here a write is visible immediately. Code written to tolerate the
 *    looser guarantee works fine under the stricter one.
 *  - **Expiry is enforced on read, not by a sweeper.** A row past its
 *    `expires_at` is invisible even if the janitor has not deleted it yet, so a
 *    lapsed step-up window or a revoked token can never come back because
 *    cleanup was slow. Deletion is purely reclaiming disk.
 */
import type { Sql } from 'postgres';

/** The subset of KVNamespace this platform actually uses. */
export interface KeyValueStore {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
  list(options?: { prefix?: string }): Promise<{ keys: Array<{ name: string }>; list_complete: boolean }>;
  getWithMetadata(key: string): Promise<{ value: string | null; metadata: null }>;
}

export function createPostgresKV(sql: Sql, namespace: string): KeyValueStore {
  return {
    async get(key) {
      const rows = await sql<{ value: string }[]>`
        SELECT value FROM kv_store
        WHERE namespace = ${namespace} AND key = ${key}
          AND (expires_at IS NULL OR expires_at > NOW())
        LIMIT 1`;
      return rows[0]?.value ?? null;
    },

    async put(key, value, options) {
      // A TTL of 0 or less would mean "already expired"; treat it as no TTL
      // rather than writing a row that is dead on arrival, matching KV, which
      // rejects TTLs below its own minimum rather than honouring them.
      const ttl = options?.expirationTtl;
      const expiresAt =
        typeof ttl === 'number' && ttl > 0 ? new Date(Date.now() + ttl * 1000) : null;
      await sql`
        INSERT INTO kv_store (namespace, key, value, expires_at)
        VALUES (${namespace}, ${key}, ${value}, ${expiresAt})
        ON CONFLICT (namespace, key)
        DO UPDATE SET value = EXCLUDED.value, expires_at = EXCLUDED.expires_at`;
    },

    async delete(key) {
      await sql`DELETE FROM kv_store WHERE namespace = ${namespace} AND key = ${key}`;
    },

    async list(options) {
      const prefix = options?.prefix ?? '';
      const rows = await sql<{ key: string }[]>`
        SELECT key FROM kv_store
        WHERE namespace = ${namespace}
          AND (expires_at IS NULL OR expires_at > NOW())
          AND key LIKE ${`${prefix.replace(/[%_\\]/g, '\\$&')}%`}
        ORDER BY key
        LIMIT 1000`;
      // list_complete is a lie only past 1000 keys, which nothing here does —
      // the caches are per-org and per-token, not enumerable working sets.
      return { keys: rows.map((r) => ({ name: r.key })), list_complete: rows.length < 1000 };
    },

    async getWithMetadata(key) {
      return { value: await this.get(key), metadata: null };
    },
  };
}

/** Reclaim expired rows. Correctness does not depend on this running. */
export async function sweepExpiredKeys(sql: Sql): Promise<number> {
  const rows = await sql<{ namespace: string }[]>`
    DELETE FROM kv_store WHERE expires_at IS NOT NULL AND expires_at < NOW() RETURNING namespace`;
  return rows.length;
}

/** Reclaim finished rate-limit windows. */
export async function sweepRateLimitCounters(sql: Sql): Promise<number> {
  const rows = await sql<{ bucket: string }[]>`
    DELETE FROM rate_limit_counters WHERE expires_at < NOW() RETURNING bucket`;
  return rows.length;
}

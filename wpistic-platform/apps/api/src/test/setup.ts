/**
 * Test setup utilities and mocks for Phase 2 test suite.
 */
import { vi } from 'vitest';
import type { Sql } from 'postgres';

/** Mock database client with common query patterns. */
export function createMockSql(): Sql {
  const sql = vi.fn() as any;
  sql.begin = vi.fn(async (fn) => fn(sql));
  return sql;
}

/** Mock EventBus for testing event publishing. */
export function createMockEventBus() {
  return {
    publish: vi.fn(async () => undefined),
  };
}

/** Mock Cloudflare KV namespace. */
export function createMockKV(): KVNamespace {
  const store = new Map<string, string>();
  return {
    get: vi.fn(async (key: string) => store.get(key) || null),
    put: vi.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
    delete: vi.fn(async (key: string) => {
      store.delete(key);
    }),
    list: vi.fn(async () => ({ keys: Array.from(store.keys()).map((name) => ({ name })), list_complete: true })),
    getWithMetadata: vi.fn(async (key: string) => ({ value: store.get(key) || null, metadata: null })),
  } as unknown as KVNamespace;
}

/** Test data helpers. */
export const testData = {
  uuids: {
    org: '00000000-0000-0000-0000-000000000001',
    product: '00000000-0000-0000-0000-000000000002',
    plan: '00000000-0000-0000-0000-000000000003',
    license: '00000000-0000-0000-0000-000000000004',
    activation: '00000000-0000-0000-0000-000000000005',
    website: '00000000-0000-0000-0000-000000000006',
    user: '00000000-0000-0000-0000-000000000007',
  },
  keys: {
    licensePrefix: 'test_',
    licenseExample: 'test_a3f9b2c1e4d5f8g9h0i1j2k3l4m5n6o7',
    websiteConnToken: 'wpconn_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6',
  },
  domains: {
    production: 'example.com',
    staging: 'staging.example.com',
    local: 'localhost',
  },
};

/** Assertion helpers for common test scenarios. */
export const assertions = {
  isValidUUID: (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value),
  isValidLicenseKey: (value: string) => /^[a-z_]+_[a-f0-9]{32}$/.test(value),
  isValidJWT: (value: string) => /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value),
  isValidSHA256: (value: string) => /^[a-f0-9]{64}$/.test(value),
};

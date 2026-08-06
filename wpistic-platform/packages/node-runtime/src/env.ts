/**
 * Builds the `env` object the Hono apps expect, from `process.env` plus the
 * adapters in this package.
 *
 * Nothing in the application changes shape: `c.env.SESSION_CACHE`,
 * `c.env.UPDATE_PACKAGES`, `c.env.HYPERDRIVE` and friends are all present with
 * the same surface, backed by Postgres and disk instead of Cloudflare.
 *
 * Required secrets are validated up front and the process refuses to start
 * without them. A platform that boots with a missing `LICENSE_SIGNING_SECRET`
 * would come up looking healthy and then hand every plugin an unverifiable
 * response — better to fail at startup, where the operator is watching.
 */
import postgres from 'postgres';
import type { Sql } from 'postgres';
import { createPostgresKV, type KeyValueStore } from './kv.ts';
import { createDiskBlobStore, createS3BlobStore, type BlobStore } from './blob.ts';
import { createOutboxQueue, type EventQueue } from './queue.ts';

export interface RuntimeOptions {
  /** Defaults to process.env; injectable for tests. */
  source?: Record<string, string | undefined>;
}

function required(source: Record<string, string | undefined>, name: string): string {
  const value = source[name];
  if (!value || value.trim() === '') {
    throw new Error(
      `Missing required environment variable ${name}. See docs/VPS_DEPLOYMENT.md for the full list.`
    );
  }
  return value;
}

/**
 * PEM values arrive from `.env` files with literal `\n` two-character
 * sequences rather than real newlines, because dotenv does not interpret
 * escapes inside unquoted values. Every consumer needs the real thing.
 */
function normalizePem(value: string): string {
  return value.includes('\\n') ? value.replace(/\\n/g, '\n') : value;
}

export function createSql(source: Record<string, string | undefined> = process.env): Sql {
  return postgres(required(source, 'DATABASE_URL'), {
    // A long-lived pool, unlike the per-request client the Workers build uses:
    // there, each isolate invocation opens and closes its own connection and
    // Hyperdrive pools upstream. A Node process is long-lived and pools itself.
    max: Number(source.DATABASE_POOL_MAX ?? '10'),
    idle_timeout: 30,
    connect_timeout: 10,
    prepare: false,
  });
}

export interface ApiRuntimeEnv extends Record<string, unknown> {
  HYPERDRIVE: { connectionString: string };
  SESSION_CACHE: KeyValueStore;
  RATE_LIMIT: KeyValueStore;
  EVENT_BUS: EventQueue;
  UPDATE_PACKAGES: BlobStore;
  ASSETS: BlobStore;
}

export function buildApiEnv(sql: Sql, options: RuntimeOptions = {}): ApiRuntimeEnv {
  const source = options.source ?? process.env;
  const connectionString = required(source, 'DATABASE_URL');

  return {
    // The application only ever reads `.connectionString` off this binding.
    HYPERDRIVE: { connectionString },
    SESSION_CACHE: createPostgresKV(sql, 'session_cache'),
    RATE_LIMIT: createPostgresKV(sql, 'rate_limit'),
    EVENT_BUS: createOutboxQueue(sql),
    UPDATE_PACKAGES: createBlobStore(sql, 'update_packages', source),
    ASSETS: createBlobStore(sql, 'assets', source),

    // RATE_LIMITER is intentionally absent — that binding is Cloudflare's edge
    // limiter. Without it the middleware uses the atomic Postgres counter,
    // which is what a self-hosted deployment should be using anyway.

    ACCOUNT_SERVICE_URL: required(source, 'ACCOUNT_SERVICE_URL'),
    DASHBOARD_URL: required(source, 'DASHBOARD_URL'),
    PUBLIC_API_URL: required(source, 'PUBLIC_API_URL'),
    PUBLIC_ACCOUNT_URL: required(source, 'PUBLIC_ACCOUNT_URL'),
    PUBLIC_DASHBOARD_URL: required(source, 'PUBLIC_DASHBOARD_URL'),
    PUBLIC_ADMIN_URL: required(source, 'PUBLIC_ADMIN_URL'),

    BILLING_MODE: source.BILLING_MODE ?? 'FREE_ONLY',
    STRIPE_PUBLISHABLE_KEY: source.STRIPE_PUBLISHABLE_KEY ?? '',
    STRIPE_SECRET_KEY: source.STRIPE_SECRET_KEY,
    STRIPE_WEBHOOK_SECRET: source.STRIPE_WEBHOOK_SECRET,

    ADMIN_EMAILS: source.ADMIN_EMAILS ?? '',
    ADMIN_ROLES: source.ADMIN_ROLES ?? '',
    ADMIN_API_TOKEN: source.ADMIN_API_TOKEN,
    ALLOW_LEGACY_ADMIN_TOKEN: source.ALLOW_LEGACY_ADMIN_TOKEN ?? 'false',

    LICENSE_SIGNING_SECRET: required(source, 'LICENSE_SIGNING_SECRET'),
    LICENSE_JWT_PRIVATE_KEY: normalizePem(required(source, 'LICENSE_JWT_PRIVATE_KEY')),
    LICENSE_JWT_PUBLIC_KEY: normalizePem(required(source, 'LICENSE_JWT_PUBLIC_KEY')),
    JWT_PUBLIC_KEY: normalizePem(required(source, 'JWT_PUBLIC_KEY')),
    JWT_PRIVATE_KEY: normalizePem(required(source, 'JWT_PRIVATE_KEY')),
    MFA_ENC_KEY: required(source, 'MFA_ENC_KEY'),
  };
}

export interface AccountRuntimeEnv extends Record<string, unknown> {
  HYPERDRIVE: { connectionString: string };
  PKCE_STORAGE: KeyValueStore;
}

export function buildAccountEnv(sql: Sql, options: RuntimeOptions = {}): AccountRuntimeEnv {
  const source = options.source ?? process.env;
  return {
    HYPERDRIVE: { connectionString: required(source, 'DATABASE_URL') },
    PKCE_STORAGE: createPostgresKV(sql, 'pkce'),
    ISSUER: required(source, 'ISSUER'),
    COOKIE_DOMAIN: required(source, 'COOKIE_DOMAIN'),
    DEFAULT_REDIRECT: required(source, 'DEFAULT_REDIRECT'),
    JWT_PRIVATE_KEY: normalizePem(required(source, 'JWT_PRIVATE_KEY')),
    JWT_PUBLIC_KEY: normalizePem(required(source, 'JWT_PUBLIC_KEY')),
    MFA_ENC_KEY: required(source, 'MFA_ENC_KEY'),
    EMAIL_WEBHOOK_URL: source.EMAIL_WEBHOOK_URL,
  };
}

function createBlobStore(
  sql: Sql,
  bucket: string,
  source: Record<string, string | undefined>
): BlobStore {
  const driver = (source.BLOB_DRIVER ?? 'disk').toLowerCase();
  if (driver === 's3') {
    return createS3BlobStore(sql, bucket, {
      endpoint: required(source, 'S3_ENDPOINT'),
      bucket: required(source, 'S3_BUCKET'),
      region: source.S3_REGION ?? 'auto',
      accessKeyId: required(source, 'S3_ACCESS_KEY_ID'),
      secretAccessKey: required(source, 'S3_SECRET_ACCESS_KEY'),
      forcePathStyle: source.S3_FORCE_PATH_STYLE !== 'false',
    });
  }
  if (driver !== 'disk') {
    throw new Error(`Unknown BLOB_DRIVER "${driver}" — expected "disk" or "s3"`);
  }
  const root = source.BLOB_ROOT ?? '/var/lib/wpistic/blobs';
  return createDiskBlobStore(sql, bucket, `${root.replace(/\/$/, '')}/${bucket}`);
}

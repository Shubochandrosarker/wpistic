/**
 * Self-hosted runtime adapters.
 *
 * The platform's application code is written against Cloudflare bindings. This
 * package supplies objects with the same surfaces, backed by Postgres and a
 * disk (or S3), so the identical Hono apps run on a VPS without a fork.
 *
 * Nothing here changes application behaviour. Every adapter is a substitution
 * at the binding boundary; routes, services, guards, and tests are untouched.
 */
export { createPostgresKV, sweepExpiredKeys, sweepRateLimitCounters, type KeyValueStore } from './kv.ts';
export {
  blobHealthCheck,
  createDiskBlobStore,
  createS3BlobStore,
  type BlobObject,
  type BlobStore,
  type S3Config,
} from './blob.ts';
export { createOutboxQueue, type EventQueue } from './queue.ts';
export {
  createExecutionContext,
  type ExecutionContextTracker,
  type NodeExecutionContext,
} from './context.ts';
export {
  buildAccountEnv,
  buildApiEnv,
  createSql,
  type AccountRuntimeEnv,
  type ApiRuntimeEnv,
  type RuntimeOptions,
} from './env.ts';
export { serveHonoApp, type ServeOptions, type RunningServer } from './server.ts';

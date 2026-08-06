/**
 * Self-hosted entry point for api.wpistic.com.
 *
 * Serves the same Hono app the Workers build deploys, with Cloudflare bindings
 * substituted by the Postgres/disk adapters in @wpistic/node-runtime. No route,
 * service, or guard differs between the two deployments.
 *
 *   node --experimental-strip-types apps/api/src/server.node.ts
 *
 * TLS is terminated upstream — by a Cloudflare Tunnel or a reverse proxy — so
 * this listens on plain HTTP and should not be published directly to the
 * internet.
 */
import { app } from './index.ts';
import {
  blobHealthCheck,
  buildApiEnv,
  createSql,
  serveHonoApp,
} from '@wpistic/node-runtime';

const sql = createSql();
const env = buildApiEnv(sql);

// Fail fast on a misconfigured deployment. A process that starts and only
// discovers at the first download that its volume is not mounted looks healthy
// on every dashboard while being useless to customers.
await sql`SELECT 1`;
await blobHealthCheck(env.UPDATE_PACKAGES);

serveHonoApp({
  app,
  env,
  sql,
  name: 'wpistic-api',
  port: Number(process.env.PORT ?? '8787'),
  hostname: process.env.BIND_HOST ?? '0.0.0.0',
});

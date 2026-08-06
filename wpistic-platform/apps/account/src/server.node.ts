/**
 * Self-hosted entry point for account.wpistic.com — the OAuth 2.1 / OIDC
 * identity service. Same app as the Workers build; only the bindings differ.
 *
 * TLS is terminated upstream. Note that this service sets `Secure` cookies
 * based on the request scheme, so it must sit behind something that speaks
 * HTTPS to the browser — a Cloudflare Tunnel or a TLS-terminating proxy — or
 * sessions will not persist.
 */
import { app } from './index.ts';
import { buildAccountEnv, createSql, serveHonoApp } from '@wpistic/node-runtime';

const sql = createSql();
const env = buildAccountEnv(sql);

await sql`SELECT 1`;

serveHonoApp({
  app,
  env,
  sql,
  name: 'wpistic-account',
  port: Number(process.env.PORT ?? '8788'),
  hostname: process.env.BIND_HOST ?? '0.0.0.0',
});

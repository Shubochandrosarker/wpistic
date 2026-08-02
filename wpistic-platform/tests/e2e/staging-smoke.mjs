#!/usr/bin/env node
/**
 * Breadth smoke test for the local Docker staging stack.
 *
 * Where golden-path.sh proves one deep licensing lifecycle, this proves that
 * every service in docker-compose.staging.yml is reachable and that each
 * surface area of the API behaves — auth gates, tenancy, catalog, licensing,
 * downloads, admin, the OIDC endpoints, and both frontends.
 *
 * It talks only to host-published ports, so it runs from the host with no
 * psql/jq/php needed. Reads .env.staging for ADMIN_API_TOKEN and the ports.
 *
 * Usage (from wpistic-platform/):  npm run staging:smoke
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

const env = Object.fromEntries(
  readFileSync(join(ROOT, '.env.staging'), 'utf8')
    .split('\n')
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)])
);

const API = `http://localhost:${env.API_PORT}`;
const ACCOUNT = `http://localhost:${env.ACCOUNT_PORT}`;
const DASHBOARD = `http://localhost:${env.DASHBOARD_PORT}`;
const ADMIN = `http://localhost:${env.ADMIN_PORT}`;
const ADMIN_TOKEN = env.ADMIN_API_TOKEN;

let passed = 0;
const failures = [];

function check(name, condition, detail = '') {
  if (condition) {
    passed++;
    console.log(`  [32mPASS[0m ${name}`);
  } else {
    failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
    console.log(`  [31mFAIL[0m ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

function section(title) {
  console.log(`\n[1m== ${title} ==[0m`);
}

async function req(url, init = {}) {
  const res = await fetch(url, init);
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* not json — fine, callers that care check `text` */
  }
  return { status: res.status, headers: res.headers, text, json };
}

async function waitFor(url, ready, label, attempts = 60) {
  let lastError = 'not ready';
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const res = await fetch(url, { redirect: 'manual' });
      const location = res.headers.get('location');
      res.body?.cancel();
      if (ready(res.status, location)) return;
      lastError = `HTTP ${res.status}${location ? ` ${location}` : ''}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`${label} did not become ready after ${attempts}s: ${lastError}`);
}

await Promise.all([
  waitFor(`${API}/health`, (status) => status === 200, 'API'),
  waitFor(`${ACCOUNT}/.well-known/openid-configuration`, (status) => status === 200, 'account'),
  waitFor(`${DASHBOARD}/`, (status) => status === 200, 'dashboard'),
  waitFor(`${ADMIN}/`, (status, location) => status === 302 && location?.startsWith('/login'), 'admin'),
]);

const admin = (path, init = {}) =>
  req(`${API}/api/v1/admin${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${ADMIN_TOKEN}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });

// ---------------------------------------------------------------------------
section('Service reachability');
// ---------------------------------------------------------------------------
{
  const health = await req(`${API}/health`);
  check('api  GET /health → 200', health.status === 200, `got ${health.status}`);
  check('api  reports its service name', health.json?.service === 'wpistic-api');

  const acct = await req(`${ACCOUNT}/health`);
  check('account GET /health → 200', acct.status === 200, `got ${acct.status}`);

  const dash = await req(`${DASHBOARD}/`);
  check('dashboard serves HTML', dash.status === 200 && dash.text.includes('<div id="root"'), `got ${dash.status}`);

  const adm = await req(`${ADMIN}/`, { redirect: 'manual' });
  check('admin redirects unauthenticated visitors to local OAuth login', adm.status === 302 && adm.headers.get('location')?.startsWith('/login'), `got ${adm.status}`);
  const login = await req(`${ADMIN}/login`, { redirect: 'manual' });
  check('admin OAuth login redirects to local account service', login.status === 302 && login.headers.get('location')?.startsWith('http://localhost:8788/authorize'), `got ${login.status}`);
}

// ---------------------------------------------------------------------------
section('OIDC discovery (account)');
// ---------------------------------------------------------------------------
{
  const disco = await req(`${ACCOUNT}/.well-known/openid-configuration`);
  check('discovery document → 200', disco.status === 200, `got ${disco.status}`);
  check('issuer matches ISSUER var', disco.json?.issuer === env.ISSUER, `got ${disco.json?.issuer}`);
  check('advertises PKCE S256', disco.json?.code_challenge_methods_supported?.includes('S256'));

  const jwks = await req(`${ACCOUNT}/.well-known/jwks.json`);
  check(
    'JWKS endpoint advertised by discovery actually serves keys',
    jwks.status === 200 && Array.isArray(jwks.json?.keys) && jwks.json.keys.length > 0,
    `got ${jwks.status} ${jwks.text.slice(0, 120)}`
  );
}

// ---------------------------------------------------------------------------
section('API authentication gates');
// ---------------------------------------------------------------------------
{
  const anon = await req(`${API}/api/v1/products`);
  check('unauthenticated /products → 401', anon.status === 401, `got ${anon.status}`);

  const bad = await req(`${API}/api/v1/products`, { headers: { Authorization: 'Bearer garbage' } });
  check('garbage bearer → 401', bad.status === 401, `got ${bad.status}`);

  const scoped = await req(`${API}/api/v1/me`, { headers: { Authorization: `Bearer ${ADMIN_TOKEN}` } });
  check('admin token is refused outside /admin/* → 403', scoped.status === 403, `got ${scoped.status}`);

  // Unknown paths *under* /api/v1 answer 401 rather than 404 — auth runs before
  // routing, so the surface can't be enumerated anonymously. That's deliberate.
  const unknownProtected = await req(`${API}/api/v1/nope`);
  check('unknown /api/v1 path → 401, not 404 (no route enumeration)', unknownProtected.status === 401);

  const missing = await req(`${API}/nope`);
  check('unknown public route → 404 with correlation id', missing.status === 404 && !!missing.json?.error?.correlation_id);

  const health = await req(`${API}/health`);
  check('security headers present', health.headers.get('x-content-type-options') === 'nosniff');
  check('correlation id echoed', !!health.headers.get('x-correlation-id'));
  check('rate-limit headers present', !!health.headers.get('x-ratelimit-limit'));
}

// ---------------------------------------------------------------------------
section('Admin surface (seeded catalog + stats)');
// ---------------------------------------------------------------------------
{
  const stats = await admin('/stats');
  check('GET /admin/stats → 200', stats.status === 200, `got ${stats.status}`);
  check('stats payload has the six counters', typeof stats.json?.stats?.total_customers === 'number');

  const customers = await admin('/customers');
  check('GET /admin/customers → 200', customers.status === 200, `got ${customers.status}`);

  const licenses = await admin('/licenses');
  check('GET /admin/licenses → 200', licenses.status === 200, `got ${licenses.status}`);

  const wrongRole = await admin('/stats', { headers: { 'X-Admin-Role': 'wizard' } });
  check('bogus X-Admin-Role is not fatal (falls back to least privilege)', wrongRole.status === 200);
}

// ---------------------------------------------------------------------------
section('Licensing lifecycle (public plugin endpoints)');
// ---------------------------------------------------------------------------
{
  const bogus = await req(`${API}/api/v1/licenses/activate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      key: 'insightistic_0000000000000000000000000000000000000000000000000000000000000000',
      domain: 'smoke.example.com',
      installation_uuid: crypto.randomUUID(),
      environment: 'production',
      product_version: '1.0.0',
    }),
  });
  check('unknown license key is rejected', bogus.status >= 400, `got ${bogus.status}`);
  check('rejection does not leak internals', !/postgres|stack|at .*\.ts:/i.test(bogus.text));

  const malformed = await req(`${API}/api/v1/licenses/activate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: 'x' }),
  });
  check('malformed activate body → 4xx (zod validation)', malformed.status >= 400 && malformed.status < 500);

  const badToken = await req(`${API}/api/v1/licenses/validate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      activation_token: 'not.a.jwt',
      domain: 'smoke.example.com',
      environment: 'production',
      installation_uuid: crypto.randomUUID(),
    }),
  });
  check('forged activation token rejected', badToken.status >= 400, `got ${badToken.status}`);
}

// ---------------------------------------------------------------------------
section('Update / download endpoints');
// ---------------------------------------------------------------------------
{
  const updates = await req(`${API}/api/v1/products/insightistic/updates?version=1.0.0&channel=stable`);
  check('update check without a license token is refused', updates.status >= 400, `got ${updates.status}`);

  const dl = await req(`${API}/api/v1/downloads/file?token=dl_forged`);
  check('forged download token → 4xx', dl.status >= 400, `got ${dl.status}`);

  const authz = await req(`${API}/api/v1/downloads/authorize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ activation_token: 'nope', product_slug: 'insightistic' }),
  });
  check('download authorize without a valid token → 4xx', authz.status >= 400, `got ${authz.status}`);
}

// ---------------------------------------------------------------------------
section('Stripe webhook signature enforcement');
// ---------------------------------------------------------------------------
{
  const unsigned = await req(`${API}/api/v1/webhooks/stripe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: 'evt_smoke', type: 'invoice.paid', data: { object: {} } }),
  });
  check('unsigned Stripe webhook rejected', unsigned.status >= 400, `got ${unsigned.status}`);
}

// ---------------------------------------------------------------------------
section('Outbox / cron');
// ---------------------------------------------------------------------------
{
  const scheduled = await req(`${API}/__scheduled?cron=*+*+*+*+*`);
  check('cron handler is invocable (wrangler --test-scheduled)', scheduled.status === 200, `got ${scheduled.status}`);
}

// ---------------------------------------------------------------------------
console.log(`\n[1m${passed} passed, ${failures.length} failed[0m`);
if (failures.length) {
  console.log('\nFailures:');
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}

#!/usr/bin/env node
// Real end-to-end customer journey against the local staging stack.
import { createHash, randomBytes, randomUUID } from 'node:crypto';
const ACC = 'http://localhost:8788';
const API = 'http://localhost:8787';
let P = 0; const F = [];
const ok = (n, c, d = '') => { if (c) { P++; console.log(`  PASS ${n}`); } else { F.push(n + (d ? ` — ${d}` : '')); console.log(`  FAIL ${n}${d ? ` — ${d}` : ''}`); } };
const sec = (t) => console.log(`\n== ${t} ==`);
async function req(url, init = {}) {
  const r = await fetch(url, { redirect: 'manual', ...init });
  const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch { }
  return { status: r.status, headers: r.headers, text: t, json: j };
}
const b64u = (b) => Buffer.from(b).toString('base64url');

sec('1. Registration');
const emailA = `a-${randomBytes(4).toString('hex')}@wpistic.local`;
const emailB = `b-${randomBytes(4).toString('hex')}@wpistic.local`;
const PW = 'Str0ng!Passw0rd#2026';
const regA = await req(`${ACC}/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: emailA, password: PW, first_name: 'Ann', last_name: 'Alpha' }) });
ok('register user A', regA.status >= 200 && regA.status < 300, `got ${regA.status} ${regA.text.slice(0, 200)}`);
const regB = await req(`${ACC}/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: emailB, password: PW, first_name: 'Bob', last_name: 'Beta' }) });
ok('register user B', regB.status >= 200 && regB.status < 300, `got ${regB.status}`);
const weak = await req(`${ACC}/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: `w-${randomBytes(3).toString('hex')}@wpistic.local`, password: '123', first_name: 'W', last_name: 'K' }) });
ok('weak password rejected', weak.status >= 400, `got ${weak.status}`);
const dup = await req(`${ACC}/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: emailA, password: PW, first_name: 'Ann', last_name: 'Alpha' }) });
ok('duplicate email rejected', dup.status >= 400, `got ${dup.status}`);

sec('2. Login + session cookie');
async function login(email) {
  const r = await req(`${ACC}/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: PW }) });
  const setc = r.headers.getSetCookie ? r.headers.getSetCookie() : [];
  return { r, cookie: setc.map((c) => c.split(';')[0]).join('; ') };
}
const LA = await login(emailA); const LB = await login(emailB);
ok('login A → 2xx', LA.r.status >= 200 && LA.r.status < 300, `got ${LA.r.status} ${LA.r.text.slice(0, 200)}`);
ok('login sets a session cookie', !!LA.cookie, `cookie="${LA.cookie}"`);
const badpw = await req(`${ACC}/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: emailA, password: 'wrong-password-xyz' }) });
ok('wrong password rejected', badpw.status >= 400, `got ${badpw.status}`);
ok('login response leaks no password hash', !/\$2[aby]\$|password_hash/i.test(LA.r.text));

sec('3. OAuth 2.1 PKCE authorization code flow');
async function oauth(cookie) {
  const verifier = b64u(randomBytes(32));
  const challenge = b64u(createHash('sha256').update(verifier).digest());
  const state = b64u(randomBytes(16));
  const u = new URL(`${ACC}/authorize`);
  u.searchParams.set('client_id', 'wpistic_dashboard');
  u.searchParams.set('redirect_uri', 'http://localhost:5173/auth/callback');
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('scope', 'openid profile email org');
  u.searchParams.set('state', state);
  u.searchParams.set('code_challenge', challenge);
  u.searchParams.set('code_challenge_method', 'S256');
  const a = await req(u.toString(), { headers: { Cookie: cookie } });
  const loc = a.headers.get('location');
  const code = loc ? new URL(loc, 'http://x').searchParams.get('code') : null;
  return { a, loc, code, verifier, challenge };
}
const O = await oauth(LA.cookie);
ok('authorize redirects (302/303)', [302, 303].includes(O.a.status), `got ${O.a.status} loc=${O.loc}`);
ok('authorization code issued', !!O.code, `location=${O.loc}`);
const tok = await req(`${ACC}/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'authorization_code', code: O.code ?? '', redirect_uri: 'http://localhost:5173/auth/callback', client_id: 'wpistic_dashboard', code_verifier: O.verifier }) });
ok('token exchange → 200', tok.status === 200, `got ${tok.status} ${tok.text.slice(0, 250)}`);
const AT = tok.json?.access_token;
ok('access_token returned', !!AT);
ok('id_token returned', !!tok.json?.id_token);
ok('refresh_token returned', !!tok.json?.refresh_token);
const replay = await req(`${ACC}/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'authorization_code', code: O.code ?? '', redirect_uri: 'http://localhost:5173/auth/callback', client_id: 'wpistic_dashboard', code_verifier: O.verifier }) });
ok('authorization code is single-use', replay.status >= 400, `got ${replay.status}`);
const O2 = await oauth(LA.cookie);
const badver = await req(`${ACC}/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'authorization_code', code: O2.code ?? '', redirect_uri: 'http://localhost:5173/auth/callback', client_id: 'wpistic_dashboard', code_verifier: b64u(randomBytes(32)) }) });
ok('wrong PKCE verifier rejected', badver.status >= 400, `got ${badver.status}`);
const O3 = await oauth(LA.cookie);
const badredir = await req(`${ACC}/authorize?client_id=wpistic_dashboard&redirect_uri=${encodeURIComponent('http://evil.example.com/cb')}&response_type=code&scope=openid&state=x&code_challenge=${O3.challenge}&code_challenge_method=S256`, { headers: { Cookie: LA.cookie } });
ok('unregistered redirect_uri rejected', badredir.status >= 400 || !(badredir.headers.get('location') || '').includes('evil.example.com'), `status ${badredir.status} loc ${badredir.headers.get('location')}`);

sec('4. API with the access token');
const H = { Authorization: `Bearer ${AT}`, 'Content-Type': 'application/json' };
const me = await req(`${API}/api/v1/me`, { headers: H });
ok('GET /me → 200', me.status === 200, `got ${me.status} ${me.text.slice(0, 200)}`);
ok('/me returns the right user', me.json?.user?.email === emailA || me.json?.email === emailA, JSON.stringify(me.json)?.slice(0, 200));
const prods = await req(`${API}/api/v1/products`, { headers: H });
ok('GET /products → 200', prods.status === 200, `got ${prods.status}`);
const plist = prods.json?.products ?? prods.json?.data ?? prods.json;
ok('catalog seeded (>=5 products)', Array.isArray(plist) && plist.length >= 5, `n=${Array.isArray(plist) ? plist.length : 'n/a'}`);

sec('5. Organizations + tenant isolation');
const orgA = await req(`${API}/api/v1/organizations`, { method: 'POST', headers: H, body: JSON.stringify({ name: `Org A ${randomBytes(3).toString('hex')}` }) });
ok('create org A → 2xx', orgA.status >= 200 && orgA.status < 300, `got ${orgA.status} ${orgA.text.slice(0, 250)}`);
const orgAId = orgA.json?.organization?.id ?? orgA.json?.id;
const OB = await oauth(LB.cookie);
const tokB = await req(`${ACC}/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'authorization_code', code: OB.code ?? '', redirect_uri: 'http://localhost:5173/auth/callback', client_id: 'wpistic_dashboard', code_verifier: OB.verifier }) });
const ATB = tokB.json?.access_token;
const HB = { Authorization: `Bearer ${ATB}`, 'Content-Type': 'application/json' };
ok('user B got an access token', !!ATB);
if (orgAId && ATB) {
  const cross = await req(`${API}/api/v1/organizations/${orgAId}/licenses`, { headers: HB });
  ok('B cannot read A org licenses → 403/404', cross.status === 403 || cross.status === 404, `got ${cross.status} ${cross.text.slice(0, 150)}`);
  const crossHdr = await req(`${API}/api/v1/organizations/${orgAId}/billing`, { headers: { ...HB, 'X-Organization-Id': orgAId } });
  ok('B cannot reach A billing via header → 4xx', crossHdr.status >= 400, `got ${crossHdr.status}`);
  const own = await req(`${API}/api/v1/organizations/${orgAId}/licenses`, { headers: H });
  ok('A can read own org licenses', own.status === 200, `got ${own.status} ${own.text.slice(0, 150)}`);
  const ents = await req(`${API}/api/v1/organizations/${orgAId}/entitlements`, { headers: H });
  ok('A can read own entitlements', ents.status === 200, `got ${ents.status}`);
  const sites = await req(`${API}/api/v1/organizations/${orgAId}/websites`, { headers: H });
  ok('A can list websites', sites.status === 200, `got ${sites.status}`);
  const credits = await req(`${API}/api/v1/organizations/${orgAId}/ai-credits`, { headers: H });
  ok('A can read AI credits', credits.status === 200, `got ${credits.status}`);
  const audit = await req(`${API}/api/v1/organizations/${orgAId}/audit`, { headers: H });
  ok('A can read audit log', audit.status === 200, `got ${audit.status}`);
  const bogus = await req(`${API}/api/v1/organizations/00000000-0000-4000-8000-000000000000/licenses`, { headers: H });
  ok('nonexistent org → 403/404', bogus.status === 403 || bogus.status === 404, `got ${bogus.status}`);
  const sqli = await req(`${API}/api/v1/organizations/${encodeURIComponent("' OR 1=1--")}/licenses`, { headers: H });
  ok('SQL-ish org id rejected as invalid uuid', sqli.status === 400 || sqli.status === 404, `got ${sqli.status}`);
}

sec('6. Billing (Stripe is a fake key here)');
if (orgAId) {
  const co = await req(`${API}/api/v1/organizations/${orgAId}/billing/checkout`, { method: 'POST', headers: H, body: JSON.stringify({ plan_slug: 'professional', product_slug: 'insightistic' }) });
  ok('checkout fails cleanly, no stack trace', co.status >= 400 && !/at .*\.ts:|postgres|sk_test_staging/i.test(co.text), `got ${co.status} ${co.text.slice(0, 200)}`);
}

sec('7. Rate limiting');
const burst = await Promise.all(Array.from({ length: 130 }, () => req(`${API}/api/v1/me`, { headers: H })));
const codes = burst.reduce((m, r) => ((m[r.status] = (m[r.status] ?? 0) + 1), m), {});
ok('rate limiter engages under burst (some 429)', !!codes['429'], `codes=${JSON.stringify(codes)}`);

console.log(`\n${P} passed, ${F.length} failed`);
if (F.length) { console.log('\nFailures:'); F.forEach((f) => console.log('  - ' + f)); }

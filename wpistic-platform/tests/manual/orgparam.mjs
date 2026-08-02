#!/usr/bin/env node
// Decisive test: is the :orgId path parameter actually honoured on org-scoped routes?
import { createHash, randomBytes } from 'node:crypto';
import { execSync } from 'node:child_process';
const ACC = 'http://localhost:8788', API = 'http://localhost:8787';
const PW = 'Str0ng!Passw0rd#2026';
const b64u = (b) => Buffer.from(b).toString('base64url');
const psql = (q) => execSync(`docker exec wpistic-staging-postgres psql -U wpistic -d wpistic -qtAX -c "${q.replace(/"/g, '\\"')}"`).toString().trim();
async function req(u, i = {}) { const r = await fetch(u, { redirect: 'manual', ...i }); const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch { } return { status: r.status, headers: r.headers, text: t, json: j }; }

const email = `p-${randomBytes(4).toString('hex')}@wpistic.local`;
await req(`${ACC}/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: PW, first_name: 'P', last_name: 'Q' }) });
const lg = await req(`${ACC}/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: PW }) });
const cookie = (lg.headers.getSetCookie() || []).map((c) => c.split(';')[0]).join('; ');
const v = b64u(randomBytes(32)), ch = b64u(createHash('sha256').update(v).digest());
const au = await req(`${ACC}/authorize?client_id=wpistic_dashboard&redirect_uri=${encodeURIComponent('http://localhost:5173/auth/callback')}&response_type=code&scope=${encodeURIComponent('openid profile email org')}&state=s&code_challenge=${ch}&code_challenge_method=S256`, { headers: { Cookie: cookie } });
const code = new URL(au.headers.get('location'), 'http://x').searchParams.get('code');
const tk = await req(`${ACC}/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: 'http://localhost:5173/auth/callback', client_id: 'wpistic_dashboard', code_verifier: v }) });
const AT = tk.json.access_token;
const H = { Authorization: `Bearer ${AT}`, 'Content-Type': 'application/json' };
const claims = JSON.parse(Buffer.from(AT.split('.')[1], 'base64url').toString());
console.log(`token org_id claim = ${claims.org_id}`);

const me = await req(`${API}/api/v1/me`, { headers: H });
const orgs = me.json?.organizations ?? me.json?.orgs ?? [];
console.log(`orgs on /me: ${JSON.stringify(orgs.map?.((o) => o.id ?? o.organization_id) ?? orgs)}`);

const o2 = await req(`${API}/api/v1/organizations`, { method: 'POST', headers: H, body: JSON.stringify({ name: `Second ${randomBytes(3).toString('hex')}` }) });
const org2 = o2.json?.organization?.id ?? o2.json?.id;
const org1 = claims.org_id;
console.log(`org1 (token/default) = ${org1}`);
console.log(`org2 (newly created) = ${org2}`);

// Plant a license in org2 ONLY.
const prod = psql("SELECT id FROM products WHERE slug='insightistic'");
const plan = psql("SELECT pl.id FROM plans pl JOIN products p ON p.id=pl.product_id WHERE p.slug='insightistic' AND pl.slug='professional'");
const kh = randomBytes(32).toString('hex');
psql(`INSERT INTO licenses (organization_id,product_id,plan_id,key_hash,key_prefix,key_mask,status,max_activations,expires_at) VALUES ('${org2}','${prod}','${plan}','${kh}','insightistic_','insightistic_****ABCD','active',3,NOW()+INTERVAL '30 days')`);
console.log(`planted 1 license in org2 only`);

const viaOrg1 = await req(`${API}/api/v1/organizations/${org1}/licenses`, { headers: H });
const viaOrg2 = await req(`${API}/api/v1/organizations/${org2}/licenses`, { headers: H });
const viaOrg2Hdr = await req(`${API}/api/v1/organizations/${org2}/licenses`, { headers: { ...H, 'X-Organization-Id': org2 } });
const n = (r) => (r.json?.licenses?.length ?? 'err');
console.log(`\nGET /organizations/{org1}/licenses      -> ${viaOrg1.status}, ${n(viaOrg1)} licenses  (org1 has 0 planted)`);
console.log(`GET /organizations/{org2}/licenses      -> ${viaOrg2.status}, ${n(viaOrg2)} licenses  (org2 has 1 planted)`);
console.log(`GET /organizations/{org2}/licenses +hdr -> ${viaOrg2Hdr.status}, ${n(viaOrg2Hdr)} licenses`);
console.log('\nVERDICT:');
if (n(viaOrg2) === 0 && n(viaOrg2Hdr) === 1) console.log('  :orgId path param IGNORED — org resolved from token/header only. URL-scoped routes return the WRONG org.');
else if (n(viaOrg2) === 1) console.log('  :orgId path param honoured correctly.');
else console.log('  inconclusive — inspect above.');

// AI credits actual sub-routes
for (const p of ['/balance', '/ledger']) {
  const r = await req(`${API}/api/v1/organizations/${org2}/ai-credits${p}`, { headers: { ...H, 'X-Organization-Id': org2 } });
  console.log(`GET /ai-credits${p} -> ${r.status} ${r.text.slice(0, 120)}`);
}

#!/usr/bin/env node
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
const root = new URL('../../', import.meta.url).pathname;
const paths = [
  ['marketing','wpistic-marketing/wrangler.jsonc'],
  ['account','wpistic-platform/apps/account/wrangler.jsonc'],
  ['api','wpistic-platform/apps/api/wrangler.jsonc'],
  ['dashboard','wpistic-platform/apps/dashboard/wrangler.jsonc'],
  ['admin','wpistic-platform/apps/admin/wrangler.jsonc'],
];
const read = p => readFileSync(join(root,p),'utf8');
const parse = p => JSON.parse(read(p));
const errors=[];
for (const [service,path] of paths) {
  if (!existsSync(join(root,path))) { errors.push(service+': missing '+path); continue; }
  const c=parse(path);
  for (const name of ['staging','production']) {
    const e=c.env?.[name];
    if (!e?.name) errors.push(service+': missing env.'+name+'.name');
    if (!e?.routes?.length) errors.push(service+': missing env.'+name+'.routes');
    if (e?.observability?.enabled !== true) errors.push(service+': observability disabled in '+name);
    if (service==='account' && !e?.secrets?.required?.includes('EMAIL_WEBHOOK_URL')) errors.push('account: EMAIL_WEBHOOK_URL not required in '+name);
    if (service==='api' && e?.vars?.BILLING_MODE!=='FREE_ONLY') errors.push('api: BILLING_MODE changed in '+name);
    if ((service==='account'||service==='api') && !e?.hyperdrive?.[0]?.id) errors.push(service+': Hyperdrive ID not provisioned in '+name);
    if (service==='account' && !e?.kv_namespaces?.[0]?.id) errors.push('account: PKCE KV ID not provisioned in '+name);
    if (service==='api' && e?.kv_namespaces?.some(x=>!x.id)) errors.push('api: KV ID not provisioned in '+name);
  }
  if (/(YOUR_|STAGING_|CHANGE_ME|PLACEHOLDER)/i.test(read(path))) errors.push(service+': unresolved placeholder in '+path);
}
for (const p of ['wpistic-marketing/src/worker.ts','wpistic-platform/apps/account/.dev.vars.example','wpistic-platform/apps/api/.dev.vars.example','wpistic-platform/apps/dashboard/.env.staging.example','wpistic-platform/apps/dashboard/.env.production.example']) if(!existsSync(join(root,p))) errors.push('missing '+p);
if (read('wpistic-platform/apps/api/src/index.ts').includes('origin: [') || read('wpistic-platform/apps/account/src/index.ts').includes('origin: [')) errors.push('CORS must use environment-specific exact allowlists');
if (errors.length) { console.error('Cloudflare configuration verification failed:'); for(const e of errors) console.error('- '+e); process.exit(1); }
console.log('Cloudflare configuration verification passed');

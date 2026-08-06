#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const root=new URL('../../',import.meta.url).pathname;
const i=process.argv.indexOf('--environment'), environment=i>=0?process.argv[i+1]:null, dryRun=process.argv.includes('--dry-run');
if(!['staging','production'].includes(environment)){console.error('Usage: node scripts/cloudflare/provision.mjs --environment <staging|production> [--dry-run]');process.exit(2);}
const prefix=environment.toUpperCase(), accountId=process.env.CLOUDFLARE_ACCOUNT_ID, databaseUrl=process.env['WPISTIC_'+prefix+'_DATABASE_URL'];
const spec={staging:{kv:[['account','PKCE_STORAGE','wpistic-staging-pkce'],['api','RATE_LIMIT','wpistic-staging-rate-limit'],['api','SESSION_CACHE','wpistic-staging-session-cache']],queues:['wpistic-staging-events','wpistic-staging-events-dlq'],buckets:['wpistic-staging-updates','wpistic-staging-assets'],hyperdrive:'wpistic-staging'},production:{kv:[['account','PKCE_STORAGE','wpistic-production-pkce'],['api','RATE_LIMIT','wpistic-production-rate-limit'],['api','SESSION_CACHE','wpistic-production-session-cache']],queues:['wpistic-events','wpistic-events-dlq'],buckets:['wpistic-updates','wpistic-assets'],hyperdrive:'wpistic-production'}}[environment];
const wrangler=(args,inherit=false)=>execFileSync('npx',['wrangler',...args],{cwd:root,encoding:'utf8',stdio:inherit?'inherit':['ignore','pipe','pipe']});
const list=args=>{const x=JSON.parse(wrangler([...args,'--json']));return Array.isArray(x)?x:x.result??x.items??[];};
const map=x=>new Map(x.map(v=>[v.title??v.name??v.queue_name??v.bucket,v.id??v.namespace_id??v.queue_id]));
const jsonId=x=>{const v=JSON.parse(x);return v.id??v.namespace_id??v.result?.id??v.result?.namespace_id;};
const update=(worker,fn)=>{const p=join(root,'wpistic-platform/apps',worker,'wrangler.jsonc'),c=JSON.parse(readFileSync(p,'utf8'));fn(c.env[environment]);writeFileSync(p,JSON.stringify(c,null,2)+'\n');};
if(!accountId||!process.env.CLOUDFLARE_API_TOKEN)throw new Error('CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN are required');
console.log('Cloudflare '+environment+' provisioning '+(dryRun?'(dry run)':''));
wrangler(['whoami'],true);
const zone=await (async()=>{const r=await fetch('https://api.cloudflare.com/client/v4/zones?name=wpistic.com&account.id='+encodeURIComponent(accountId)+'&status=active',{headers:{Authorization:'Bearer '+process.env.CLOUDFLARE_API_TOKEN}});if(!r.ok)throw new Error('Zone lookup HTTP '+r.status);const b=await r.json();if(!b.success||b.result?.length!==1)throw new Error('Expected exactly one active wpistic.com zone');return b.result[0].id;})();
const kv=map(list(['kv','namespace','list'])),queues=map(list(['queues','list'])),buckets=map(list(['r2','bucket','list'])),hd=map(list(['hyperdrive','list'])),matrix=[];
for(const [worker,binding,name] of spec.kv){let id=kv.get(name);if(!id&&!dryRun)id=jsonId(wrangler(['kv','namespace','create',name,'--json']));if(id)update(worker,e=>{e.kv_namespaces.find(x=>x.binding===binding).id=id;});matrix.push({type:'KV',name,binding,resource_id:id??null,status:id?(kv.has(name)?'reused':'created'):'planned'});}
for(const name of spec.queues){const present=queues.has(name);if(!present&&!dryRun)wrangler(['queues','create',name],true);matrix.push({type:'Queue',name,status:present?'reused':dryRun?'planned':'created'});}
for(const name of spec.buckets){const present=buckets.has(name);if(!present&&!dryRun)wrangler(['r2','bucket','create',name],true);matrix.push({type:'R2',name,status:present?'reused':dryRun?'planned':'created'});}
let id=hd.get(spec.hyperdrive);if(!id){if(!dryRun&&!databaseUrl)throw new Error('WPISTIC_'+prefix+'_DATABASE_URL is required to create Hyperdrive');if(!dryRun)id=jsonId(wrangler(['hyperdrive','create',spec.hyperdrive,'--connection-string',databaseUrl,'--json']));}if(id)for(const worker of ['account','api'])update(worker,e=>{e.hyperdrive.find(x=>x.binding==='HYPERDRIVE').id=id;});matrix.push({type:'Hyperdrive',name:spec.hyperdrive,resource_id:id??null,status:id?(hd.has(spec.hyperdrive)?'reused':'created'):'planned'});matrix.push({type:'native rate limit namespace',status:'manual-owner-action-required'});
writeFileSync(join(root,'docs','CLOUDFLARE_RESOURCE_MATRIX.'+environment+'.json'),JSON.stringify({generated_at:new Date().toISOString(),environment,zone_id:zone,resources:matrix},null,2)+'\n');
console.log('Resource matrix written without secret values');

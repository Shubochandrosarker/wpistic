#!/usr/bin/env node
const environment=process.argv[2];
if(!['staging','production'].includes(environment)) throw new Error('Usage: node tests/e2e/cloudflare-smoke.mjs <staging|production>');
const base=environment==='production'
 ? {marketing:'https://www.wpistic.com',account:'https://account.wpistic.com',api:'https://api.wpistic.com',dashboard:'https://app.wpistic.com',admin:'https://admin.wpistic.com'}
 : {marketing:'https://www-staging.wpistic.com',account:'https://account-staging.wpistic.com',api:'https://api-staging.wpistic.com',dashboard:'https://app-staging.wpistic.com',admin:'https://admin-staging.wpistic.com'};
for(const [name,url] of [['marketing health',base.marketing+'/__health'],['account health',base.account+'/health'],['account discovery',base.account+'/.well-known/openid-configuration'],['api health',base.api+'/health'],['dashboard root',base.dashboard+'/'],['admin access perimeter',base.admin+'/login']]) { const r=await fetch(url,{redirect:'manual'}); if(r.status>=500) throw new Error(name+' returned HTTP '+r.status); console.log(name+': HTTP '+r.status); }

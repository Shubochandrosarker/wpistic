# WPistic Platform Deployment Guide

## Overview

WPistic is deployed on Cloudflare Workers with PostgreSQL (Hyperdrive), KV namespaces, Queues, and R2 buckets.

Each service (account, api, dashboard, admin) is an independent Worker deployed to its own route.

## Prerequisites

1. **Cloudflare Account** with Workers, KV, Queues, R2, and Hyperdrive enabled
2. **PostgreSQL Database** (Neon, Supabase, or self-hosted) version 16+
3. **Node.js 20+** and **pnpm**
4. **Wrangler CLI** v3.80+

```bash
npm install -g wrangler
pnpm install
```

## Environment Setup

### 1. Database (PostgreSQL 16)

Create a new PostgreSQL database. Then:

```bash
# Migrate to latest schema
pnpm run db:migrate

# Seed catalog + OAuth clients
pnpm run db:seed
```

This creates:
- 10 migration tables (identity, catalog, licenses, websites, etc.)
- Default products (Seoistic, Insightistic, etc.)
- OAuth clients for product apps

### 2. Secrets

Each app has a `.dev.vars` file (local) and secrets (production via `wrangler secret put`).

#### Shared Secrets (All Apps)

```bash
# From: account.wpistic.com
# Generate new RS256 key pair:
openssl genrsa -out private_key.pem 2048
openssl pkcs8 -topk8 -nocrypt -in private_key.pem -out private_key_pkcs8.pem
openssl rsa -in private_key.pem -pubout -out public_key.pem

wrangler secret put JWT_PRIVATE_KEY --env production < private_key_pkcs8.pem
wrangler secret put JWT_PUBLIC_KEY --env production < public_key.pem
```

#### Account Service (`apps/account/.dev.vars`)

```bash
HYPERDRIVE_CONNECTION_STRING=postgresql://user:pass@host:5432/wpistic
JWT_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n..."
JWT_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----\n..."
MFA_ENC_KEY="$(openssl rand -base64 32)"
SESSION_DURATION_HOURS=24
REFRESH_TOKEN_TTL_HOURS=7776  # 9 months
```

Deploy secrets:
```bash
cd apps/account
wrangler secret put JWT_PRIVATE_KEY --env production
wrangler secret put JWT_PUBLIC_KEY --env production
wrangler secret put MFA_ENC_KEY --env production
```

#### API Service (`apps/api/.dev.vars`)

```bash
HYPERDRIVE_CONNECTION_STRING=postgresql://user:pass@host:5432/wpistic
LICENSE_SIGNING_SECRET="$(openssl rand -hex 32)"
LICENSE_JWT_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n..."   # RS256, PKCS8 PEM — distinct keypair from JWT_PRIVATE_KEY
LICENSE_JWT_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----\n..."     # RS256, SPKI PEM
ADMIN_API_TOKEN="$(openssl rand -hex 32)"
ADMIN_EMAILS="admin@company.com,support@company.com"
STRIPE_SECRET_KEY="sk_test_..."
STRIPE_WEBHOOK_SECRET="whsec_..."
JWT_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----\n..."
SESSION_CACHE_TTL_SECONDS=86400
LICENSE_CHECK_AFTER_SECONDS=43200
LICENSE_GRACE_PERIOD_DAYS=7
DOWNLOAD_URL_TTL_SECONDS=900
```

`LICENSE_JWT_PRIVATE_KEY`/`LICENSE_JWT_PUBLIC_KEY` sign/verify plugin
activation tokens (RS256) — generate a keypair the same way as the shared
JWT pair above, but keep it **separate**: mixing audiences across a shared
RSA keypair lets a token minted for one system be replayed against the
other.

```bash
openssl genrsa -out license_private_key.pem 2048
openssl pkcs8 -topk8 -nocrypt -in license_private_key.pem -out license_private_key_pkcs8.pem
openssl rsa -in license_private_key.pem -pubout -out license_public_key.pem
```

Deploy secrets:
```bash
cd apps/api
wrangler secret put LICENSE_SIGNING_SECRET --env production
wrangler secret put LICENSE_JWT_PRIVATE_KEY --env production < license_private_key_pkcs8.pem
wrangler secret put LICENSE_JWT_PUBLIC_KEY --env production < license_public_key.pem
wrangler secret put ADMIN_API_TOKEN --env production
wrangler secret put ADMIN_EMAILS --env production
wrangler secret put STRIPE_SECRET_KEY --env production
wrangler secret put STRIPE_WEBHOOK_SECRET --env production
wrangler secret put JWT_PUBLIC_KEY --env production
```

#### Dashboard (`apps/dashboard/.env.local`)

```bash
VITE_API_URL=https://api.wpistic.com
VITE_ACCOUNT_URL=https://account.wpistic.com
VITE_MARKETPLACE_URL=https://www.wpistic.com
```

#### Admin Portal (`apps/admin/.env.local`)

```bash
PUBLIC_API_URL=https://api.wpistic.com
PUBLIC_ACCOUNT_URL=https://account.wpistic.com
```

### 3. Cloudflare Resources

#### KV Namespaces

Create three KV namespaces:

```bash
wrangler kv:namespace create "PKCE_STORAGE" --preview false
wrangler kv:namespace create "RATE_LIMIT" --preview false
wrangler kv:namespace create "SESSION_CACHE" --preview false
```

Update `wrangler.jsonc` for each worker with the IDs returned.

#### Queues

Create two queues:

```bash
wrangler queues create wpistic-events
wrangler queues create wpistic-events-dlq  # dead-letter queue
```

#### R2 Buckets

Create two R2 buckets:

```bash
wrangler r2 bucket create wpistic-updates
wrangler r2 bucket create wpistic-assets
```

#### Hyperdrive

Create a Hyperdrive database binding in Cloudflare dashboard or CLI. Point it
at the restricted `wpistic_app` role (created by migration `012`), not the
schema-owning role — Row Level Security only binds to a non-owner role (see
migration `0010`'s note); connecting as the owner silently bypasses RLS
entirely.

```bash
wrangler hyperdrive create wpistic-db --connection-string postgresql://wpistic_app:<password>@host:5432/wpistic
```

Update `wrangler.jsonc` with the Hyperdrive ID. Also set a real password for
`wpistic_app` in production — migration `012` creates the role with a
placeholder password:
```sql
ALTER ROLE wpistic_app PASSWORD '<a real generated secret>';
```

#### Cron Trigger (outbox publisher)

No manual setup needed — `apps/api/wrangler.jsonc` already declares
`"crons": ["* * * * *"]`, wired to the `scheduled` export in
`apps/api/src/index.ts`. It runs automatically once the Worker is deployed;
verify it in the Cloudflare dashboard under Workers → Triggers.

### 4. DNS & Route Configuration

Add DNS records pointing to Cloudflare:

```
account.wpistic.com      CNAME  your-account-worker.workers.dev
api.wpistic.com          CNAME  your-api-worker.workers.dev
app.wpistic.com          CNAME  your-dashboard-worker.workers.dev
admin.wpistic.com        CNAME  your-admin-worker.workers.dev
www.wpistic.com          CNAME  your-marketing-worker.workers.dev
```

Then set route bindings in Cloudflare Workers settings or via `wrangler.jsonc`.

## Local Development

### 1. Start PostgreSQL

```bash
docker-compose up -d postgres
```

### 2. Run Migrations

```bash
pnpm run db:migrate
pnpm run db:seed
```

### 3. Start All Services

In separate terminals:

```bash
# Terminal 1: Account service
pnpm run dev:account

# Terminal 2: API
pnpm run dev:api

# Terminal 3: Dashboard (optional)
pnpm run dev:dashboard

# Terminal 4: Admin portal (optional)
pnpm run dev:admin
```

Services run on:
- Account: `http://localhost:8787` (via wrangler)
- API: `http://localhost:8787` (via wrangler)
- Dashboard: `http://localhost:5173`
- Admin: `http://localhost:3000`

### 4. Test License Flow

```bash
# 1. Create an org + user via account service
# 2. Grant complimentary access via the admin API (issues a license for
#    plugin products; see modules/admin/routes.ts POST /organizations/:orgId/grant)
curl -X POST http://localhost:8787/api/v1/admin/organizations/your-org-id/grant \
  -H "X-Admin-API-Token: $(cat apps/api/.dev.vars | grep ADMIN_API_TOKEN | cut -d= -f2)" \
  -H "Content-Type: application/json" \
  -d '{
    "product_slug": "seoistic",
    "plan_slug": "professional",
    "reason": "manual QA license for local testing"
  }'

# 3. Activate license from "plugin"
curl -X POST http://localhost:8787/api/v1/licenses/activate \
  -H "Content-Type: application/json" \
  -d '{
    "key": "seoistic_3f9a2b7c1d8e4f60a1b2c3d4e5f60718",
    "domain": "example.com",
    "installation_uuid": "test-install-123",
    "wp_version": "6.6",
    "php_version": "8.2",
    "product_version": "1.0.0"
  }'

# 4. Validate license — domain/environment/installation_uuid must match the
#    activation exactly, or the server rejects it with 403.
curl -X POST http://localhost:8787/api/v1/licenses/validate \
  -H "Content-Type: application/json" \
  -d '{
    "activation_token": "eyJ...",
    "domain": "example.com",
    "environment": "production",
    "installation_uuid": "test-install-123",
    "plugin_version": "1.0.0"
  }'
```

## Production Deployment

### 1. Build All Workspaces

```bash
pnpm run build
pnpm run typecheck
```

### 2. Deploy Account Service

```bash
cd apps/account
wrangler deploy --env production
```

### 3. Deploy API Service

```bash
cd apps/api
wrangler deploy --env production
```

### 4. Deploy Dashboard (if applicable)

```bash
cd apps/dashboard
wrangler deploy --env production
```

### 5. Deploy Admin Portal

```bash
cd apps/admin
wrangler deploy --env production
```

### 6. Verify Deployments

```bash
# Check account service
curl https://account.wpistic.com/health

# Check API
curl https://api.wpistic.com/health

# Check dashboard
curl https://app.wpistic.com/

# Check admin
curl https://admin.wpistic.com/
```

## Monitoring & Observability

### Logs

All Cloudflare Workers logs appear in the Cloudflare dashboard under "Logs" → "Workers".

To tail live logs:

```bash
wrangler tail --env production
```

### Metrics

Enable Cloudflare Logpush to aggregate logs:

```bash
wrangler logpush create \
  --destination-conf bucket=your-bucket,path="logs/{DATE}/{TIME}/" \
  --dataset http_requests \
  --frequency low \
  --filter 'OriginIP eq "1.2.3.4"'
```

### Database Monitoring

Use your database provider's tools (Neon Console, Supabase Dashboard, etc.) to monitor:
- Connection count
- Query performance
- Backup status
- Replication lag

### Error Tracking

Errors are logged with `correlation_id` for tracing. Implement error aggregation:

1. Capture error logs via Logpush
2. Parse `correlation_id` to group related errors
3. Alert on 5xx errors or rate spike

Example error entry:
```
{
  "level": "error",
  "message": "license activation failed",
  "correlation_id": "uuid-123",
  "error": "max_activations_exceeded",
  "timestamp": "2026-07-25T07:00:00Z"
}
```

## Backup & Recovery

### Database Backups

For Neon:
```bash
# Automated backups (every 6 hours by default)
# Manual backup via: https://console.neon.tech
```

For Supabase:
```bash
# Automated backups (daily)
# Manual backup + restore via: https://supabase.com/dashboard
```

### R2 Backups

R2 data is replicated across Cloudflare's edge. For additional safety:

```bash
# Download all updates
aws s3 sync s3://wpistic-updates s3://backup-bucket/wpistic-updates/ \
  --endpoint-url https://your-r2-endpoint.com
```

### Recovery Procedure

**Database Recovery:**
1. Restore from backup in database console
2. Verify data integrity: `SELECT COUNT(*) FROM licenses;`
3. Run migrations to latest version: `pnpm run db:migrate`

**Worker Recovery:**
1. Redeploy workers: `wrangler deploy --env production`
2. Workers are stateless, no recovery needed (KV/Queues data persists)

## Scaling

### Worker Scaling

Cloudflare Workers auto-scales to your traffic. No configuration needed.

### Database Scaling

Increase connection limit or upgrade database plan if:
- Query latency increases
- Connection pool exhaustion errors appear

For Hyperdrive, increase compute tier in Cloudflare dashboard.

### KV/Queue Scaling

KV has 1 million writes/sec limit per namespace (soft limit). If exceeded:
- Create separate KV namespaces for different data types
- Implement local caching layer

## Security Best Practices

1. **Rotate secrets regularly**
   ```bash
   wrangler secret put <SECRET_NAME> --env production
   ```

2. **Enable Cloudflare DDoS protection** (default, enabled for all Workers)

3. **Restrict API access** via IP whitelist (if needed):
   ```bash
   # In Cloudflare dashboard: Page Rules → Block by IP
   ```

4. **Monitor audit logs** for admin actions:
   ```bash
   # Via API
   GET /api/v1/admin/audit?org_id=...&action=...
   ```

5. **Enable MFA** for all admin accounts (required)

6. **Review RLS policies** regularly to ensure tenant isolation

## Troubleshooting

### "Cannot connect to database"
- Verify `HYPERDRIVE_CONNECTION_STRING` in secrets
- Check database is running and accessible
- Verify Cloudflare network allows outbound to database

### "KV namespace not found"
- Verify KV namespace IDs in `wrangler.jsonc`
- Re-create namespaces if missing: `wrangler kv:namespace create <NAME>`

### "Rate limited"
- Check `X-RateLimit-Remaining` header
- Wait until `X-RateLimit-Reset` time
- Add retry logic with exponential backoff

### "License activation fails with 429"
- Same as rate limiting above
- Or: too many activation attempts from same IP in 1 hour

## Rollback Procedure

To rollback a deployment:

```bash
# Get previous deployment
wrangler deployments list --env production

# Redeploy previous version
wrangler deploy --env production --version <VERSION_ID>
```

Or redeploy from git:

```bash
git checkout <PREVIOUS_COMMIT>
pnpm install
pnpm run build
wrangler deploy --env production
```

---

For additional help, see:
- [Cloudflare Workers Docs](https://developers.cloudflare.com/workers/)
- [Wrangler CLI Docs](https://developers.cloudflare.com/workers/wrangler/install-and-update/)
- [WPistic API Specification](./API_SPECIFICATION.md)

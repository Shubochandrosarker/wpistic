# WPistic Ecosystem Control Plane

Federated edge-native SaaS platform on Cloudflare Workers — the commercial and
operational backbone of the WordPressistic ecosystem. Products (Chatbotistic,
Insightistic, SEOistic, Memberistic, Bookingistic, Formistic, Postistic,
CRMistic, Licenseistic, WPistic AI Bridge, Messageistic, FFL Checkout,
Scheduleistic, Mailistic, Verifyistic)
stay independent applications; this platform owns identity, organizations,
entitlements, licensing, billing, websites, AI credits, support, and audit.

## Services

| Domain | App | Stack |
|---|---|---|
| `account.wpistic.com` | `apps/account` | OAuth 2.1 / OIDC server — Hono, Hyperdrive PostgreSQL, KV (PKCE), RS256 JWTs, TOTP MFA, branded login flows |
| `api.wpistic.com` | `apps/api` | Control plane REST API — modular monolith (Hono), Queues event bus, KV rate limits/caches, R2 update packages, Stripe |
| `app.wpistic.com` | `apps/dashboard` | Customer ecosystem dashboard — React + Vite + Tailwind SPA on Workers Assets |
| `admin.wpistic.com` | `apps/admin` | Owner/staff operations portal — Astro SSR on Workers + React islands |

Shared packages: `@wpistic/types` (Zod contracts + domain events),
`@wpistic/ui-design-system` (dark premium Tailwind preset + tokens),
`@wpistic/platform-sdk` (typed API client), `@wpistic/auth-sdk` (PKCE SSO flow).
WordPress plugins integrate through `wordpress-sdk/` (Composer:
`wpistic/wordpress-sdk`).

## Architecture principles

- **Modular monolith** — one API Worker, strict internal module boundaries
  (`apps/api/src/modules/*`), service classes, no cross-module table access.
- **Organization-first tenancy** — every commercial entity belongs to an
  organization; users hold role-based memberships.
- **Entitlement-driven authorization** — never `plan === 'agency'`; always
  `entitlements->allows('product.feature')`.
- **Event-driven internally** — Cloudflare Queues domain events feed cache
  invalidation, notifications, and signed webhooks to product apps.
- **HMAC-signed license responses** — plugins verify offline via a
  per-license key derived from `LICENSE_SIGNING_SECRET` (the master secret
  never ships in plugin code).
- **Grace-period resilience** — plugins keep premium features alive through
  temporary API downtime (7 days), then degrade without destroying data.

## Local development

```bash
# 1. Infrastructure
docker compose up -d                     # PostgreSQL 16 on :5432
npm install

# 2. Database
DATABASE_URL=postgresql://wpistic:password@localhost:5432/wpistic npm run db:migrate
DATABASE_URL=postgresql://wpistic:password@localhost:5432/wpistic npm run db:seed

# 3. Secrets for local Workers (apps/account/.dev.vars, apps/api/.dev.vars)
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out private.pem
openssl rsa -in private.pem -pubout -out public.pem
openssl rand -base64 32                  # MFA_ENC_KEY
openssl rand -hex 32                     # LICENSE_SIGNING_SECRET

# 4. Run (separate terminals)
npm run dev:account                      # :8788
npm run dev:api                          # :8787
npm run dev:dashboard                    # :5173  (VITE_API_URL/VITE_ACCOUNT_URL to point locally)
npm run dev:admin                        # :4321
```

`database/schema.sql` is generated — edit migrations, then `npm run
db:migrate` applies pending files and `npm --workspace @wpistic/database run
schema` regenerates the canonical file.

## Deployment

Each app has its own `wrangler.jsonc` with a custom domain route. Provision
once per environment:

1. PostgreSQL (Neon/Supabase) + a **Hyperdrive** config → put the id in
   `apps/{account,api}/wrangler.jsonc`.
2. KV namespaces: `PKCE_STORAGE` (account), `RATE_LIMIT` + `SESSION_CACHE` (api).
3. Queue `wpistic-events` (+ `wpistic-events-dlq`), R2 buckets
   `wpistic-updates` / `wpistic-assets`.
4. Secrets via `wrangler secret put`: account — `JWT_PRIVATE_KEY`,
   `JWT_PUBLIC_KEY`, `MFA_ENC_KEY`; api — those plus
   `LICENSE_SIGNING_SECRET` and the license keypair. Production starts in
   `BILLING_MODE=FREE_ONLY`; Stripe secrets are optional and may be injected
   only after payment-owner approval and webhook readiness. Admin uses staff
   OAuth JWTs and fresh MFA for mutations.
5. Stripe webhook endpoint → `https://api.wpistic.com/api/v1/webhooks/stripe`.
6. `npm run deploy:account && npm run deploy:api && npm run deploy:dashboard && npm run deploy:admin`.

Maintain separate wrangler environments (local / staging / production) with
separate databases, Stripe modes, OAuth clients, and secrets.

## Security model (summary)

- TLS everywhere; strict CORS to known app origins; security headers on every
  response.
- Rate limits: 100 req/min/IP, 1000 req/min/API key, 5 failed license
  activations/hour/IP; login failures 10/15min/IP.
- Zod validation on every route; parameterized SQL only; explicit organization
  predicates on tenant tables. Transaction-scoped RLS and the non-owner
  `wpistic_app` role remain a production release gate until proven live.
- Only hashes stored for: passwords (bcrypt), license keys, API keys, session
  + refresh tokens, authorization codes, invitation and reset tokens,
  connection tokens. MFA secrets are AES-GCM encrypted.
- Idempotency: `X-Idempotency-Key` replay for activation/billing, unique
  Stripe event ids, unique usage-event keys per org.
- Admin impersonation: staff JWT + fresh TOTP + written reason → 30-minute
  restricted token; billing/destructive routes reject it; owners are
  notified; everything audited as `actor_type='admin'`.

## Plugin SDK contract

Implemented endpoints (see `apps/api/src/modules/licenses`, `websites`,
`updates`):

```
POST /api/v1/licenses/activate      POST /api/v1/licenses/validate
POST /api/v1/licenses/deactivate    POST /api/v1/licenses/refresh
GET  /api/v1/products/{slug}/updates
POST /api/v1/downloads/authorize    GET  /api/v1/downloads/file?token=…
POST /api/v1/websites/connect       POST /api/v1/websites/heartbeat
POST /api/v1/usage/events
```

Validation responses return the full entitlement set, `check_after: 43200`,
`grace_period_days: 7`, and an HMAC `signature` the plugin verifies offline.

## Status vs. build phases

- **Phase 1 (foundation)** — complete: monorepo, schema/migrations/seeds,
  auth service, API skeleton + identity/orgs, seeded products.
- **Phase 2 (licensing)** — complete: issue/activate/validate/deactivate/
  rotate, website registry, WordPress SDK, update authorization + signed
  downloads.
- **Phase 3 (billing)** — complete: Stripe checkout/portal/webhooks →
  internal subscriptions → entitlement recalculation, AI credit grants.
- **Phase 4 (dashboard)** & **admin portal** — complete for the specified
  pages; transactional email delivery is stubbed behind `EMAIL_WEBHOOK_URL`.
- **Security hardening & launch readiness** — complete: RS256 activation
  tokens, hex HMAC response signatures derived from `license_key_hash`,
  license/activation status reconciled with the database, server-side grace
  period, canonical updates/downloads module (single-use KV grants, R2
  streaming), website `max_websites` enforcement, transactional outbox for
  license/billing-webhook events, idempotent billing webhooks, pooled-connection
  safety, and a completed WordPress SDK
  (encrypted-at-rest tokens, full PHPUnit suite). See
  `docs/API_SPECIFICATION.md` for the current contract.
- Next: product-app SSO rollout (Insightistic first), marketplace checkout on
  www.wpistic.com, bundles purchase flow, e2e tenant-boundary test suite.

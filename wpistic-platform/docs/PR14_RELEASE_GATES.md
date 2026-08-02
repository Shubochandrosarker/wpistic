# PR #14 — Production Closure and Free Launch

This record is the release-gate snapshot for the free-only launch. It is
deliberately explicit about what was verified in this workspace and what still
requires an authorized deployment operator.

## Launch policy

- Production billing mode is `FREE_ONLY`.
- Free-product claims require no Stripe session, card, or publishable key.
- Stripe test mode is reserved for staging after an authorized business/payment
  administrator supplies valid credentials.
- Paid checkout, customer portal, and Stripe webhooks remain disabled until the
  business account and webhook configuration are ready.
- The canonical catalog contains 15 products. `ffl-checkout` remains visible as
  `coming_soon` with `compliance_hold`; it has no free claim or paid checkout
  path in this launch.

## Verified in local Docker staging

These are executable checks against the local Compose stack, not proof of a
Cloudflare or Hostinger deployment:

- `npm run staging:smoke` — **32 passed, 0 failed**.
- Compose service health — API, account, dashboard, admin, and Postgres
  healthy.
- `docker compose --env-file .env.staging -f docker-compose.staging.yml --profile tools run --rm tests` — API Vitest **107/107** and the golden path **15 checks passed**.
- Golden path coverage includes RS256 activation, PHP HMAC verification,
  update selection, streaming package upload, single-use download replay
  rejection, token rotation, fixed grace-period expiry, and deactivation.
- `npm --workspace @wpistic/api run typecheck` — passed.
- `npm --workspace @wpistic/platform-sdk run typecheck` — passed.
- Platform SDK tests — **2/2**.
- `npm --workspace @wpistic/admin run typecheck` — 0 errors, 0 warnings,
  0 hints.
- `npm --workspace @wpistic/database run schema` — regeneration is idempotent.
- Marketing `npm run check:static` — typecheck, lint, Next static export, and
  static-output verification passed; 53 routes were generated.
- `git diff --check` — no whitespace errors.

The test environment uses generated local-only secrets in the ignored
`.env.staging`; no Stripe secret, production credential, or deploy token is
committed.

## Release blockers before production

Production deployment remains **NO-GO** until all of these are supplied and
verified by the authorized operator:

1. PR #14 is reviewed and its GitHub Actions gates pass, including migration
   validation, all application builds, PHP SDK Composer/PHPUnit checks, and the
   staging smoke job.
2. Cloudflare resource IDs and bindings are replaced with real environment
   configuration: Hyperdrive/VPC path, KV rate limiter, R2 buckets, Queue, and
   the required secrets. The `YOUR_*` values in Wrangler configuration are
   local/configuration markers, not deploy proof.
3. Hostinger Business static-host deployment is configured with the reviewed
   `wpistic-marketing/out` artifact and `.htaccess`, followed by a live domain
   smoke check.
4. Production database backup/restore evidence, migration approval, and
   connection-pool limits are recorded.
5. DNS, TLS, OAuth redirect allowlists, CORS origins, account/admin/API URLs,
   and rollback targets are verified in the target environments.
6. An authorized business/payment administrator provides valid Stripe
   credentials and webhook signing configuration if and when billing moves out
   of `FREE_ONLY`. No demo secret is acceptable.
7. Owner approval is recorded for the production launch and rollback window.

Until those gates are complete, this branch must not deploy to production.

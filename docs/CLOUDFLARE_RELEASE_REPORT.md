# WPistic Cloudflare release report

Date: 2026-08-06
Branch: chore/cloudflare-production-setup

## Audit summary

The codebase had useful Workers/VPS application code and substantial tests, but production configuration was incomplete: only Admin had both environments; Account/API had invented resource IDs; Dashboard had no environment build/deploy model; Marketing had no Worker wrapper; production CORS and security headers were incomplete; email relay delivery was optional; and Cloudflare resources, Access, DNS, TLS, secrets, database role/RLS, and live smoke evidence were absent.

This branch adds the missing code, configuration, automation, and documentation and intentionally stops at verified preparation.

## Verification results

| Gate | Result |
|---|---|
| npm lock refresh | passed with npm; Node 18 engine warnings |
| new automation syntax | passed with node --check |
| npm ci | passed in both workspaces with Node 18 engine warnings; Wrangler still requires Node 22 |
| Typecheck/build/tests | API tests 125/125 passed with Web Crypto; marketing lint/typecheck passed; Dashboard/Admin builds passed; marketing build blocked by Node 18; API Worker build blocked by Wrangler Node 22 requirement |
| Wrangler check/dry-runs | blocked by Node 18 and unprovisioned IDs/secrets; verifier correctly failed on missing Hyperdrive/KV IDs |
| Database migrations/RLS/backup/restore | not run; no PostgreSQL credentials |
| Auth/email/MFA/license gates | not run |
| DNS/TLS/Access/custom domains | not run |
| Queue/DLQ/R2/Cron/Logs | not run |
| Config JSON parse / automation syntax | passed; live staging/production smoke not run |

## Human actions remaining

- Use Node 22, authenticate Wrangler, and provide a scoped Cloudflare API token/account ID.
- Provide isolated staging/production database URLs and complete the database gate.
- Review DNS conflicts and approve Custom Domain migration.
- Provision or verify KV, Queue, R2, Hyperdrive, native rate-limit, and Access resources.
- Enter distinct staging/production secrets and configure the transactional email relay.
- Run staging deploy and all staging gates before production approval.
- Configure GitHub staging and production Environments, with production approval.
- Provide Stripe credentials only if billing intentionally changes from FREE_ONLY.

## Production status

BLOCKED

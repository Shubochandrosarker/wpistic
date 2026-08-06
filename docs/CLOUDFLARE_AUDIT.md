# WPistic Cloudflare audit

Date: 2026-08-06
Branch: chore/cloudflare-production-setup
Target: Cloudflare Workers with PostgreSQL 16+ through Hyperdrive

## Current state

The repository contains four platform Workers (Account, API, Dashboard, Admin) and a standalone Next.js static-export marketing site. VPS Docker deployment remains present and was not changed. The platform has npm workspaces, Hono services, Astro Admin, a Vite dashboard, PostgreSQL migrations, KV/Queues/R2 references, and existing local staging smoke/golden-path tooling.

## Confirmed working parts

- Marketing keeps Next static export, trailing slashes, and unoptimized images.
- Account exposes OAuth/OIDC discovery, JWKS, PKCE, sessions, MFA, and reset routes.
- API exports fetch, queue, and scheduled handlers; the one-minute outbox Cron is present.
- API has tenant middleware, audit middleware, idempotency handling, license flows, queue handlers, and R2 update/download code.
- Dashboard is a Workers Static Assets SPA and uses Vite compile-time API/account URLs.
- Admin uses the Astro Cloudflare adapter and application-level staff/session/MFA checks.
- VPS compose files, node-runtime package, and VPS deployment guide were preserved.
- Existing test suites cover substantial API, SDK, database, and PHP behavior.

## Findings fixed in this branch

- Added explicit staging and production environments to all five Workers.
- Added the Marketing Worker, canonical apex-to-www 308 redirect, health route, static 404 behavior, cache policy, CSP, HSTS, and staging noindex.
- Replaced production-wide CORS lists with exact environment-specific origin allowlists.
- Added no-store and security headers for Account, API, and Admin.
- Made the transactional email relay a required Account secret and made password reset fail closed when it is unavailable.
- Added compile-time Dashboard staging/production build and deployment scripts.
- Pinned Wrangler 4.114.0 and Workers Types 5.20260728.1 across Worker packages. The current Astro adapter was not blindly upgraded across a major compatibility boundary.
- Added safe secret/environment templates, provisioning, verification, and smoke-test tooling.
- Added observability settings, release scripts, CI workflow, and canonical deployment/security/database documentation.

## Remaining blockers

- Cloudflare authentication, account/zone confirmation, custom-domain conflict checks, and resource provisioning have not been executed here.
- Hyperdrive and KV IDs are intentionally absent until Cloudflare confirms matching resources; no invented IDs were committed. The verifier blocks release until they are populated.
- The native Rate Limiting binding still needs an owner-created namespace ID and config entry.
- Custom domains, TLS, Cloudflare Access policy, DNSSEC, and workers.dev exposure have not been verified.
- Production database must use a restricted non-owner runtime role, FORCE ROW LEVEL SECURITY, functional request tenant context, backup, and restore evidence. Existing repository audits record this as unresolved.
- Transactional email relay delivery, Account auth integration tests, full staging infrastructure smoke, and production smoke have not been executed.
- The execution image is Node 18.19.1; the repository requires Node 20+, and Wrangler 4.114.0 requires Node 22+. CI uses Node 22.

## Commands executed

- Repository and prompt audit with rg, find, sed, and git.
- Created branch chore/cloudflare-production-setup.
- npm install --package-lock-only in wpistic-platform.
- node --check for new Cloudflare scripts.
- Web verification of the current Wrangler/Workers Types release and Wrangler configuration/secrets guidance.

## Commands not executed

npm ci, frontend builds, typechecks, tests, Wrangler checks/dry-runs, database migrations, Docker staging, live smoke tests, DNS/TLS checks, Cloudflare provisioning, Access setup, queue/R2 checks. These need Node 22 and owner credentials/resources.

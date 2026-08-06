# WPistic Cloudflare Workers deployment

This is the canonical Workers deployment path. The alternative VPS plus Cloudflare Tunnel path is documented separately in wpistic-platform/docs/VPS_DEPLOYMENT.md. Do not point the same production hostname at both targets.

## Toolchain

Use npm and Node 22 for the current Wrangler release.

    cd wpistic/wpistic-platform
    npm ci

Every Worker uses wrangler.jsonc with explicit env.staging and env.production. Deploy with the environment flag; never deploy an implicit production/default Worker.

## Provisioning

Set these only in the operator shell or GitHub Environment:

- CLOUDFLARE_ACCOUNT_ID
- CLOUDFLARE_API_TOKEN, scoped to the account, wpistic.com zone, and required Workers/KV/R2/Queues/Hyperdrive permissions
- WPISTIC_STAGING_DATABASE_URL, restricted staging runtime database URL
- WPISTIC_PRODUCTION_DATABASE_URL, restricted production runtime database URL

Inspect without mutation:

    node scripts/cloudflare/provision.mjs --environment staging --dry-run
    node scripts/cloudflare/provision.mjs --environment production --dry-run

After conflict review:

    node scripts/cloudflare/provision.mjs --environment staging
    node scripts/cloudflare/provision.mjs --environment production

The utility confirms Wrangler auth and the wpistic.com zone, inventories resources, reuses exact-name matches, refuses ambiguous duplicates, creates missing KV/Queue/R2/Hyperdrive resources, writes confirmed Hyperdrive/KV IDs, and writes a non-secret environment matrix. It does not provision DNS, Access, database roles, or secrets. Native Rate Limiting namespace creation remains an owner action.

## Database and secrets

Use separate staging and production databases. Apply migrations with the migration role, never the runtime role. Complete docs/DATABASE_PRODUCTION_GATE.md before production.

Generate distinct staging and production key material. Set secrets interactively with npx wrangler secret put NAME --env staging or --env production from the owning Worker directory. The required names are listed in docs/CLOUDFLARE_SECRETS.md. Never put secrets in vars, committed dev vars, or production env files.

## Validation and staging

    npm run cloudflare:verify
    npm run cloudflare:dry-run:staging
    npm run cloudflare:deploy:staging
    npm run cloudflare:smoke:staging

Build Dashboard with staging URLs before deploy. Verify direct refresh for products, websites, licenses, billing, team, security, settings, auth/callback, and invitations/accept. Confirm staging tokens cannot call production endpoints.

## Production

Production is only the approved GitHub Environment workflow:

1. Verify the exact main-branch commit and clean checkout.
2. Repeat install, typecheck, tests, builds, and all ten Worker dry-runs.
3. Take and restore-test a database backup.
4. Apply migrations with the production migration role.
5. Deploy Account, API, Dashboard, Admin, then Marketing with env.production.
6. Record Worker version IDs and run health, OIDC, CORS, Access, licensing, queue/DLQ, R2, Cron, and header smoke tests.
7. Stop promotion and roll back if a critical check fails.

## Domains and rollback

Use Workers Custom Domains from the environment config. Inspect existing A, AAAA, CNAME, tunnel, Pages, and Worker destinations first. Do not create CNAME records to workers.dev for these names. Enable Full Strict SSL, verify certificates and DNSSEC, and test apex-to-www redirect loops.

Put Cloudflare Access in front of Admin only; do not put a browser login wall in front of the public API or customer Dashboard.

    cd wpistic-platform/apps/api
    npx wrangler versions list --env production
    npx wrangler rollback VERSION_ID --env production

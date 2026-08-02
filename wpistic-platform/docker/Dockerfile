# Single image for the whole local staging stack.
#
# All four apps share one npm workspace install, so building four separate
# images would mean four copies of the same node_modules. Instead this builds
# one image and docker-compose.staging.yml picks a different command per
# service (see docker/entrypoint.sh).
#
# Debian (not Alpine) on purpose: wrangler ships workerd, esbuild, and the
# Cloudflare local-dev binaries as glibc-linked prebuilds.
FROM node:22-bookworm-slim

# curl        — healthchecks and the e2e HTTP calls
# jq + psql   — required by tests/e2e/golden-path.sh
# php-cli     — golden-path.sh cross-checks the API's HMAC signature against
#               wordpress-sdk/src/Security/HmacVerifier.php; without php it
#               silently skips the one test that proves the TS↔PHP contract
# openssl     — checksums and key material in the e2e script
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      curl jq openssl ca-certificates postgresql-client php-cli \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Workspace manifests first so `npm ci` caches independently of source edits.
COPY package.json package-lock.json tsconfig.base.json ./
COPY apps/api/package.json          apps/api/
COPY apps/account/package.json      apps/account/
COPY apps/dashboard/package.json    apps/dashboard/
COPY apps/admin/package.json        apps/admin/
COPY packages/types/package.json    packages/types/
COPY packages/auth-sdk/package.json packages/auth-sdk/
COPY packages/platform-sdk/package.json packages/platform-sdk/
COPY packages/ui-design-system/package.json packages/ui-design-system/
COPY database/package.json          database/

RUN npm ci --no-audit --no-fund

COPY apps      apps
COPY packages  packages
COPY database  database
COPY tests     tests
# golden-path.sh resolves $(dirname $0)/../../wordpress-sdk — i.e. /app/wordpress-sdk.
COPY wordpress-sdk wordpress-sdk
COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

# Belt and braces alongside .gitattributes: a clone made before .gitattributes
# existed (or with core.autocrlf=true) still has CRLF shell scripts, which die
# inside the container with `set: pipefail: invalid option name`.
RUN sed -i 's/\r$//' /usr/local/bin/entrypoint.sh tests/e2e/*.sh \
 && chmod +x tests/e2e/*.sh

# Local mode only — never contact the Cloudflare API from this stack.
ENV WRANGLER_SEND_METRICS=false \
    CI=1 \
    NODE_ENV=development

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]

#!/usr/bin/env bash
#
# Per-service entrypoint for the local Docker staging stack.
#
# `wrangler dev` reads secrets from a `.dev.vars` file next to wrangler.jsonc,
# not from the process environment, so each Worker service renders its own
# .dev.vars from the container env (fed by .env.staging) before starting.
# Non-secret `vars` are overridden with `--var` on the command line, because
# wrangler.jsonc hardcodes the production hostnames.
set -euo pipefail

ROLE="${1:?usage: entrypoint.sh <api|account|dashboard|admin|migrate|shell>}"
shift || true

# Writes KEY=VALUE lines to a .dev.vars, taking values verbatim from the
# environment. PEM values arrive with literal \n escapes; the apps expand them
# via normalizePem(), so they must NOT be expanded here.
write_dev_vars() {
  local target="$1"; shift
  : >"$target"
  for name in "$@"; do
    printf '%s=%s\n' "$name" "${!name-}" >>"$target"
  done
  echo "[entrypoint] wrote $target ($# keys)"
}

wait_for_postgres() {
  local url="${DATABASE_URL:?DATABASE_URL is required}"
  echo "[entrypoint] waiting for postgres..."
  for _ in $(seq 1 60); do
    if node -e "
      import('postgres').then(async ({default: pg}) => {
        const sql = pg(process.env.DATABASE_URL, { max: 1, idle_timeout: 1 });
        try { await sql\`SELECT 1\`; process.exit(0); }
        catch { process.exit(1); }
        finally { await sql.end({ timeout: 1 }).catch(() => {}); }
      }).catch(() => process.exit(1));
    " 2>/dev/null; then
      echo "[entrypoint] postgres is up"
      return 0
    fi
    sleep 2
  done
  echo "[entrypoint] FATAL: postgres never became reachable at $url" >&2
  return 1
}

case "$ROLE" in
  migrate)
    wait_for_postgres
    npm run db:migrate
    npm run db:seed
    npm --workspace @wpistic/database run status
    ;;

  api)
    wait_for_postgres
    write_dev_vars apps/api/.dev.vars \
      LICENSE_SIGNING_SECRET LICENSE_JWT_PRIVATE_KEY LICENSE_JWT_PUBLIC_KEY \
      JWT_PUBLIC_KEY JWT_PRIVATE_KEY MFA_ENC_KEY ADMIN_API_TOKEN ALLOW_LEGACY_ADMIN_TOKEN
    # --test-scheduled: Miniflare never fires cron triggers on its own, so the
    # outbox publisher is reachable at POST /__scheduled instead.
    exec npx wrangler dev \
      --config apps/api/wrangler.jsonc \
      --ip 0.0.0.0 --port "${API_PORT:-8787}" \
      --test-scheduled \
      --var "ACCOUNT_SERVICE_URL:${ACCOUNT_SERVICE_URL}" \
      --var "PUBLIC_API_URL:${PUBLIC_API_URL}" \
      --var "PUBLIC_ACCOUNT_URL:${PUBLIC_ACCOUNT_URL}" \
      --var "PUBLIC_DASHBOARD_URL:${PUBLIC_DASHBOARD_URL}" \
      --var "PUBLIC_ADMIN_URL:${PUBLIC_ADMIN_URL}" \
      --var "BILLING_MODE:${BILLING_MODE}" \
      --var "DASHBOARD_URL:${DASHBOARD_URL}" \
      --var "STRIPE_PUBLISHABLE_KEY:${STRIPE_PUBLISHABLE_KEY:-}" \
      --var "ADMIN_EMAILS:${ADMIN_EMAILS}" \
      --var "ADMIN_ROLES:${ADMIN_ROLES:-}" \
      "$@"
    ;;

  account)
    wait_for_postgres
    write_dev_vars apps/account/.dev.vars \
      JWT_PRIVATE_KEY JWT_PUBLIC_KEY MFA_ENC_KEY
    exec npx wrangler dev \
      --config apps/account/wrangler.jsonc \
      --ip 0.0.0.0 --port "${ACCOUNT_PORT:-8788}" \
      --var "ISSUER:${ISSUER}" \
      --var "COOKIE_DOMAIN:${COOKIE_DOMAIN}" \
      --var "DEFAULT_REDIRECT:${DEFAULT_REDIRECT}" \
      "$@"
    ;;

  dashboard)
    cd apps/dashboard
    exec npx vite --host 0.0.0.0 --port "${DASHBOARD_PORT:-5173}" "$@"
    ;;

  admin)
    # The Astro Cloudflare adapter's platformProxy reads .dev.vars for both
    # secrets and var overrides, so API_URL goes in here rather than on the CLI.
    : > apps/admin/.dev.vars
    printf 'API_URL=%s\n' "${ADMIN_API_URL:-http://api:8787}" >>apps/admin/.dev.vars
    printf 'DASHBOARD_URL=%s\n' "${DASHBOARD_URL}" >>apps/admin/.dev.vars
    printf 'ACCOUNT_URL=%s\n' "${ADMIN_ACCOUNT_URL:-http://account:8788}" >>apps/admin/.dev.vars
    printf 'PUBLIC_ACCOUNT_URL=%s\n' "${PUBLIC_ACCOUNT_URL:-http://localhost:8788}" >>apps/admin/.dev.vars
    printf 'ADMIN_CLIENT_ID=%s\n' "${ADMIN_CLIENT_ID:-wpistic_admin}" >>apps/admin/.dev.vars
    printf 'ADMIN_REDIRECT_URI=%s\n' "${ADMIN_REDIRECT_URI:-http://localhost:4321/auth/callback}" >>apps/admin/.dev.vars
    cd apps/admin
    exec npx astro dev --host 0.0.0.0 --port "${ADMIN_PORT:-4321}" "$@"
    ;;

  # Full test sweep against the running stack. Run with:
  #   docker compose --env-file .env.staging -f docker-compose.staging.yml \
  #     run --rm --no-deps -e API_URL=http://api:8787 api-tests
  test)
    wait_for_postgres
    echo "[entrypoint] --- vitest (apps/api) ---"
    npm --workspace @wpistic/api run test -- --run
    echo "[entrypoint] --- golden path e2e ---"
    API_URL="${API_URL:-http://api:8787}" \
    DATABASE_URL="${DATABASE_URL}" \
    ADMIN_API_TOKEN="${ADMIN_API_TOKEN}" \
      bash tests/e2e/golden-path.sh
    ;;

  shell)
    exec "$@"
    ;;

  *)
    echo "unknown role: $ROLE" >&2
    exit 64
    ;;
esac

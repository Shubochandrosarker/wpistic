#!/bin/sh
# Role dispatcher for the self-hosted image. One image, six roles.
set -eu

case "${1:-api}" in
  api)
    exec node /app/api/server.mjs
    ;;

  account)
    exec node /app/account/server.mjs
    ;;

  scheduler)
    # Exactly one of these per deployment. A second would not corrupt anything
    # — the outbox uses FOR UPDATE SKIP LOCKED and the expiry sweep is
    # idempotent — but the two would just contend for the same rows.
    exec node /app/api/scheduler.mjs
    ;;

  dashboard)
    # Customer dashboard SPA — static files with an index.html fallback.
    exec node /app/dashboard-server.mjs
    ;;

  admin)
    # Staff portal — Astro SSR built with the @astrojs/node adapter
    # (ASTRO_ADAPTER=node at build time; see apps/admin/astro.config.mjs).
    HOST="${ADMIN_HOST:-0.0.0.0}" PORT="${ADMIN_PORT:-4321}" \
      exec node /app/admin/server/entry.mjs
    ;;

  migrate)
    # Runs to completion and exits; compose gates the services on it.
    # Seeds are idempotent, so a redeploy re-applies them harmlessly and picks
    # up catalog corrections shipped since the last release.
    cd /app/database
    node migrate.js up
    if [ "${RUN_SEEDS:-true}" = "true" ]; then
      node migrate.js seed
    fi
    ;;

  *)
    echo "Unknown role '$1' — expected api, account, dashboard, admin, scheduler, or migrate" >&2
    exit 64
    ;;
esac

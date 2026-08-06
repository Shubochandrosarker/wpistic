#!/usr/bin/env bash
# Back up everything a WPistic deployment cannot be rebuilt without.
#
# Two things matter, and neither is in git:
#   1. the database — every customer, license, organization, and audit record;
#   2. the blob volume — the plugin .zip files customers download.
#
# A database-only backup restores to a platform that knows about every license
# but cannot serve a single update. Both, or neither.
#
#   bash docker/backup-vps.sh [destination]     # default ./backups
set -euo pipefail

DEST="${1:-./backups}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
COMPOSE="docker compose --env-file .env.vps -f docker-compose.vps.yml"

mkdir -p "$DEST"

echo "==> Database"
# --clean --if-exists so the dump restores onto a populated database without a
# manual drop first — the state you are actually in during a recovery.
$COMPOSE exec -T postgres pg_dump \
  --username "${POSTGRES_USER:-wpistic}" \
  --dbname "${POSTGRES_DB:-wpistic}" \
  --clean --if-exists --no-owner \
  | gzip > "$DEST/wpistic-db-$STAMP.sql.gz"
echo "    $DEST/wpistic-db-$STAMP.sql.gz"

echo "==> Update packages"
# Streamed straight out of the volume: no dependency on where Docker keeps it,
# and it works the same whether the API container is running or not.
$COMPOSE run --rm --no-deps -T --entrypoint sh api \
  -c 'tar -cf - -C /var/lib/wpistic/blobs . 2>/dev/null || true' \
  | gzip > "$DEST/wpistic-blobs-$STAMP.tar.gz"
echo "    $DEST/wpistic-blobs-$STAMP.tar.gz"

echo
echo "Done. Verify before trusting it:"
echo "  gzip -t $DEST/wpistic-db-$STAMP.sql.gz && echo 'db archive intact'"
echo "  gzip -t $DEST/wpistic-blobs-$STAMP.tar.gz && echo 'blob archive intact'"
echo
echo "An untested backup is a guess. Restore into a scratch database at least once:"
echo "  gunzip -c $DEST/wpistic-db-$STAMP.sql.gz | psql \"\$SCRATCH_DATABASE_URL\""
echo
echo "Copy both files off this VPS. A backup stored only on the machine it"
echo "protects does not survive the failure it exists for."

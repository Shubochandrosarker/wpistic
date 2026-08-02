#!/usr/bin/env bash
set -uo pipefail
API_URL="http://localhost:8787"
sql() { psql "$DATABASE_URL" -qtAX -c "$1"; }
RUN_ID="$(openssl rand -hex 4)"
DOMAIN="dl-${RUN_ID}.example.com"
IU="$(cat /proc/sys/kernel/random/uuid)"
LK="insightistic_$(openssl rand -hex 16)"
KH="$(printf '%s' "$LK" | openssl dgst -sha256 -hex | awk '{print $NF}')"
ORG="$(sql "INSERT INTO organizations (name,slug,billing_email) VALUES ('DL ${RUN_ID}','dl-${RUN_ID}','dl@example.com') RETURNING id")"
PID_="$(sql "SELECT id FROM products WHERE slug='insightistic'")"
PLID="$(sql "SELECT pl.id FROM plans pl JOIN products p ON p.id=pl.product_id WHERE p.slug='insightistic' AND pl.slug='professional'")"
sql "INSERT INTO licenses (organization_id,product_id,plan_id,key_hash,key_prefix,key_mask,status,max_activations,expires_at) VALUES ('$ORG','$PID_','$PLID','$KH','insightistic_','insightistic_****${LK: -4}','active',3,NOW()+INTERVAL '30 days')" >/dev/null
TOK="$(curl -sf -X POST "$API_URL/api/v1/licenses/activate" -H 'Content-Type: application/json' -d "{\"key\":\"$LK\",\"domain\":\"$DOMAIN\",\"installation_uuid\":\"$IU\",\"environment\":\"production\",\"product_version\":\"1.0.0\"}" | jq -r .activation_token)"
VER="99.$RANDOM.0"
PKG=/tmp/pkg.zip
printf 'PK\x05\x06%s' "$(head -c 100 /dev/urandom | base64)" > "$PKG"
SHA="$(openssl dgst -sha256 -hex <"$PKG" | awk '{print $NF}')"
UP="$(curl -sf -X PUT "$API_URL/api/v1/admin/packages/upload?product_slug=insightistic&version=$VER" -H "Authorization: Bearer $ADMIN_API_TOKEN" -H "x-package-checksum: $SHA" -H 'Content-Type: application/zip' --data-binary "@$PKG")"
PP="$(jq -r .package_path <<<"$UP")"
echo "upload -> $UP"
REG="$(curl -sf -X POST "$API_URL/api/v1/admin/packages" -H "Authorization: Bearer $ADMIN_API_TOKEN" -H 'Content-Type: application/json' -d "{\"product_slug\":\"insightistic\",\"version\":\"$VER\",\"package_path\":\"$PP\",\"checksum\":\"$SHA\",\"channel\":\"stable\"}")"
PKGID="$(jq -r .package.id <<<"$REG")"
curl -sf -X POST "$API_URL/api/v1/admin/packages/$PKGID/publish" -H "Authorization: Bearer $ADMIN_API_TOKEN" >/dev/null
AUTH="$(curl -sf -X POST "$API_URL/api/v1/downloads/authorize" -H 'Content-Type: application/json' -d "{\"activation_token\":\"$TOK\",\"product_slug\":\"insightistic\",\"requested_version\":\"$VER\"}")"
echo "authorize -> $AUTH"
DL="$(jq -r .download_url <<<"$AUTH")"
echo "download_url -> $DL"
echo "=== VERBOSE DOWNLOAD ==="
curl -s -D /tmp/hdr.txt -o /tmp/got.bin -w 'http_code=%{http_code} size=%{size_download}\n' "$DL"
echo "--- response headers ---"; cat /tmp/hdr.txt
echo "--- body (first 400 bytes) ---"; head -c 400 /tmp/got.bin; echo
echo "expected sha: $SHA"
echo "got      sha: $(openssl dgst -sha256 -hex </tmp/got.bin | awk '{print $NF}')"
echo "=== download_grants row ==="
sql "SELECT token_hash IS NOT NULL AS has_hash, consumed_at, expires_at, package_id FROM download_grants ORDER BY created_at DESC LIMIT 3" || true

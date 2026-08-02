#!/usr/bin/env bash
set -uo pipefail
API_URL="http://localhost:8787"
sql() { psql "$DATABASE_URL" -qtAX -c "$1"; }
P=0; F=0
ok(){ P=$((P+1)); echo "   OK   $1"; }
no(){ F=$((F+1)); echo "   FAIL $1"; }
R="$(openssl rand -hex 4)"; D="dl2-${R}.example.com"; IU="$(cat /proc/sys/kernel/random/uuid)"
LK="insightistic_$(openssl rand -hex 16)"
KH="$(printf '%s' "$LK" | openssl dgst -sha256 -hex | awk '{print $NF}')"
ORG="$(sql "INSERT INTO organizations (name,slug,billing_email) VALUES ('DL2 ${R}','dl2-${R}','dl2@example.com') RETURNING id")"
PRD="$(sql "SELECT id FROM products WHERE slug='insightistic'")"
PLN="$(sql "SELECT pl.id FROM plans pl JOIN products p ON p.id=pl.product_id WHERE p.slug='insightistic' AND pl.slug='professional'")"
LID="$(sql "INSERT INTO licenses (organization_id,product_id,plan_id,key_hash,key_prefix,key_mask,status,max_activations,expires_at) VALUES ('$ORG','$PRD','$PLN','$KH','insightistic_','insightistic_****${LK: -4}','active',3,NOW()+INTERVAL '30 days') RETURNING id")"
TOK="$(curl -sf -X POST "$API_URL/api/v1/licenses/activate" -H 'Content-Type: application/json' -d "{\"key\":\"$LK\",\"domain\":\"$D\",\"installation_uuid\":\"$IU\",\"environment\":\"production\",\"product_version\":\"1.0.0\"}" | jq -r .activation_token)"
VER="99.$RANDOM.0"; PKG=/tmp/p2.zip
printf 'PK\x05\x06%s' "$(head -c 100 /dev/urandom | base64)" > "$PKG"
SHA="$(openssl dgst -sha256 -hex <"$PKG" | awk '{print $NF}')"
PP="$(curl -sf -X PUT "$API_URL/api/v1/admin/packages/upload?product_slug=insightistic&version=$VER" -H "Authorization: Bearer $ADMIN_API_TOKEN" -H "x-package-checksum: $SHA" -H 'Content-Type: application/zip' --data-binary "@$PKG" | jq -r .package_path)"
PKGID="$(curl -sf -X POST "$API_URL/api/v1/admin/packages" -H "Authorization: Bearer $ADMIN_API_TOKEN" -H 'Content-Type: application/json' -d "{\"product_slug\":\"insightistic\",\"version\":\"$VER\",\"package_path\":\"$PP\",\"checksum\":\"$SHA\",\"channel\":\"stable\"}" | jq -r .package.id)"
curl -sf -X POST "$API_URL/api/v1/admin/packages/$PKGID/publish" -H "Authorization: Bearer $ADMIN_API_TOKEN" >/dev/null
echo "== 7. download (rewriting prod host -> localhost) =="
DL="$(curl -sf -X POST "$API_URL/api/v1/downloads/authorize" -H 'Content-Type: application/json' -d "{\"activation_token\":\"$TOK\",\"product_slug\":\"insightistic\",\"requested_version\":\"$VER\"}" | jq -r .download_url)"
echo "   raw download_url: $DL"
LOCAL_DL="${DL/http:\/\/api.wpistic.com/$API_URL}"
C1="$(curl -s -o /tmp/g1.bin -w '%{http_code}' "$LOCAL_DL")"
[ "$C1" = "200" ] && ok "download 200" || no "download got $C1"
G="$(openssl dgst -sha256 -hex </tmp/g1.bin | awk '{print $NF}')"
[ "$G" = "$SHA" ] && ok "sha256 matches" || no "sha mismatch"
C2="$(curl -s -o /dev/null -w '%{http_code}' "$LOCAL_DL")"
[ "$C2" = "403" ] && ok "replay -> 403 (single use)" || no "replay got $C2"
echo "== 8. refresh rotates + revokes old =="
NT="$(curl -sf -X POST "$API_URL/api/v1/licenses/refresh" -H 'Content-Type: application/json' -d "{\"activation_token\":\"$TOK\"}" | jq -r .activation_token)"
{ [ "$NT" != "$TOK" ] && [ "$NT" != "null" ]; } && ok "token rotated" || no "refresh failed"
OC="$(curl -s -o /dev/null -w '%{http_code}' -X POST "$API_URL/api/v1/licenses/validate" -H 'Content-Type: application/json' -d "{\"activation_token\":\"$TOK\",\"domain\":\"$D\",\"environment\":\"production\",\"installation_uuid\":\"$IU\"}")"
{ [ "$OC" = "401" ] || [ "$OC" = "403" ]; } && ok "old token revoked ($OC)" || no "old token still accepted ($OC)"
TOK="$NT"
echo "== 9. expiry -> grace -> past grace =="
sql "UPDATE licenses SET expires_at=NOW()-INTERVAL '1 day' WHERE id='$LID'" >/dev/null
GS="$(curl -sf -X POST "$API_URL/api/v1/licenses/validate" -H 'Content-Type: application/json' -d "{\"activation_token\":\"$TOK\",\"domain\":\"$D\",\"environment\":\"production\",\"installation_uuid\":\"$IU\"}" | jq -r .status)"
[ "$GS" = "grace_period" ] && ok "1d past expiry -> grace_period" || no "expected grace_period got $GS"
sql "UPDATE licenses SET expires_at=NOW()-INTERVAL '8 days' WHERE id='$LID'" >/dev/null
PV="$(curl -s -X POST "$API_URL/api/v1/licenses/validate" -H 'Content-Type: application/json' -d "{\"activation_token\":\"$TOK\",\"domain\":\"$D\",\"environment\":\"production\",\"installation_uuid\":\"$IU\"}" | jq -r '.valid // "err"')"
[ "$PV" != "true" ] && ok "8d past expiry -> not valid ($PV)" || no "still valid past grace"
sql "UPDATE licenses SET expires_at=NOW()+INTERVAL '30 days', grace_period_ends_at=NULL WHERE id='$LID'" >/dev/null
echo "== 10. deactivate revokes =="
curl -sf -X POST "$API_URL/api/v1/licenses/deactivate" -H 'Content-Type: application/json' -d "{\"activation_token\":\"$TOK\",\"installation_uuid\":\"$IU\"}" >/dev/null && ok "deactivate 2xx" || no "deactivate failed"
DC="$(curl -s -o /dev/null -w '%{http_code}' -X POST "$API_URL/api/v1/licenses/validate" -H 'Content-Type: application/json' -d "{\"activation_token\":\"$TOK\",\"domain\":\"$D\",\"environment\":\"production\",\"installation_uuid\":\"$IU\"}")"
{ [ "$DC" = "401" ] || [ "$DC" = "403" ]; } && ok "deactivated token rejected ($DC)" || no "still accepted ($DC)"
echo; echo "RESULT: $P passed, $F failed"

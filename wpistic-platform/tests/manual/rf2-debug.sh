#!/usr/bin/env bash
set -uo pipefail
A="http://localhost:8787"
sql() { psql "$DATABASE_URL" -qtAX -c "$1"; }
mklic() {
  local R="$1"
  local LK="insightistic_$(openssl rand -hex 16)"
  local KH="$(printf '%s' "$LK" | openssl dgst -sha256 -hex | awk '{print $NF}')"
  local ORG="$(sql "INSERT INTO organizations (name,slug,billing_email) VALUES ('T ${R}','t-${R}','t@example.com') RETURNING id")"
  local PRD="$(sql "SELECT id FROM products WHERE slug='insightistic'")"
  local PLN="$(sql "SELECT pl.id FROM plans pl JOIN products p ON p.id=pl.product_id WHERE p.slug='insightistic' AND pl.slug='professional'")"
  sql "INSERT INTO licenses (organization_id,product_id,plan_id,key_hash,key_prefix,key_mask,status,max_activations,expires_at) VALUES ('$ORG','$PRD','$PLN','$KH','insightistic_','insightistic_****${LK: -4}','active',3,NOW()+INTERVAL '30 days')" >/dev/null
  echo "$LK"
}
run_case() {
  local LABEL="$1" DELAY="$2"
  local R="$(openssl rand -hex 4)"; local D="c-${R}.example.com"; local IU="$(cat /proc/sys/kernel/random/uuid)"
  local LK="$(mklic "$R")"
  local T1="$(curl -sf -X POST "$A/api/v1/licenses/activate" -H 'Content-Type: application/json' -d "{\"key\":\"$LK\",\"domain\":\"$D\",\"installation_uuid\":\"$IU\",\"environment\":\"production\",\"product_version\":\"1.0.0\"}" | jq -r .activation_token)"
  sleep "$DELAY"
  local T2="$(curl -sf -X POST "$A/api/v1/licenses/refresh" -H 'Content-Type: application/json' -d "{\"activation_token\":\"$T1\"}" | jq -r .activation_token)"
  local SAME="different"; [ "$T1" = "$T2" ] && SAME="IDENTICAL"
  local CODE="$(curl -s -o /dev/null -w '%{http_code}' -X POST "$A/api/v1/licenses/validate" -H 'Content-Type: application/json' -d "{\"activation_token\":\"$T2\",\"domain\":\"$D\",\"environment\":\"production\",\"installation_uuid\":\"$IU\"}")"
  echo "  [$LABEL] delay=${DELAY}s  new-token-vs-old=$SAME  validate(new)=$CODE"
  echo "     iat(old)=$(echo "$T1" | cut -d. -f2 | base64 -d 2>/dev/null | jq -r .iat 2>/dev/null)  iat(new)=$(echo "$T2" | cut -d. -f2 | base64 -d 2>/dev/null | jq -r .iat 2>/dev/null)"
  # second refresh immediately after the first (retry scenario)
  local T3="$(curl -sf -X POST "$A/api/v1/licenses/refresh" -H 'Content-Type: application/json' -d "{\"activation_token\":\"$T2\"}" | jq -r '.activation_token // "ERR"')"
  local SAME2="different"; [ "$T2" = "$T3" ] && SAME2="IDENTICAL"
  local CODE3="$(curl -s -o /dev/null -w '%{http_code}' -X POST "$A/api/v1/licenses/validate" -H 'Content-Type: application/json' -d "{\"activation_token\":\"$T3\",\"domain\":\"$D\",\"environment\":\"production\",\"installation_uuid\":\"$IU\"}")"
  echo "     immediate 2nd refresh: new-vs-prev=$SAME2  validate=$CODE3"
}
echo "=== refresh determinism matrix ==="
run_case "same-second" 0
run_case "after-2s"    2

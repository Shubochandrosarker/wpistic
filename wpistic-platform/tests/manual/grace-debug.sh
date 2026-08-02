#!/usr/bin/env bash
# Clean grace-period + deactivate check using the ORIGINAL activation token
# (no refresh in the chain, so the refresh determinism bug can't mask results).
set -uo pipefail
A="http://localhost:8787"
sql() { psql "$DATABASE_URL" -qtAX -c "$1"; }
R="$(openssl rand -hex 4)"; D="gr-${R}.example.com"; IU="$(cat /proc/sys/kernel/random/uuid)"
LK="insightistic_$(openssl rand -hex 16)"
KH="$(printf '%s' "$LK" | openssl dgst -sha256 -hex | awk '{print $NF}')"
ORG="$(sql "INSERT INTO organizations (name,slug,billing_email) VALUES ('GR ${R}','gr-${R}','gr@example.com') RETURNING id")"
PRD="$(sql "SELECT id FROM products WHERE slug='insightistic'")"
PLN="$(sql "SELECT pl.id FROM plans pl JOIN products p ON p.id=pl.product_id WHERE p.slug='insightistic' AND pl.slug='professional'")"
LID="$(sql "INSERT INTO licenses (organization_id,product_id,plan_id,key_hash,key_prefix,key_mask,status,max_activations,expires_at) VALUES ('$ORG','$PRD','$PLN','$KH','insightistic_','insightistic_****XXXX','active',3,NOW()+INTERVAL '30 days') RETURNING id")"
T="$(curl -sf -X POST "$A/api/v1/licenses/activate" -H 'Content-Type: application/json' -d "{\"key\":\"$LK\",\"domain\":\"$D\",\"installation_uuid\":\"$IU\",\"environment\":\"production\",\"product_version\":\"1.0.0\"}" | jq -r .activation_token)"
v() { curl -s -X POST "$A/api/v1/licenses/validate" -H 'Content-Type: application/json' -d "{\"activation_token\":\"$T\",\"domain\":\"$D\",\"environment\":\"production\",\"installation_uuid\":\"$IU\"}"; }
echo "active      -> $(v | jq -c '{valid,status}')"
sql "UPDATE licenses SET expires_at=NOW()-INTERVAL '1 day' WHERE id='$LID'" >/dev/null
echo "expired 1d  -> $(v | jq -c '{valid,status,grace_period_ends_at}')"
sql "UPDATE licenses SET expires_at=NOW()-INTERVAL '3 days' WHERE id='$LID'" >/dev/null
echo "expired 3d  -> $(v | jq -c '{valid,status}')"
sql "UPDATE licenses SET expires_at=NOW()-INTERVAL '8 days' WHERE id='$LID'" >/dev/null
echo "expired 8d  -> $(v | jq -c '{valid,status} // .error.code')"
sql "UPDATE licenses SET expires_at=NOW()+INTERVAL '30 days', grace_period_ends_at=NULL WHERE id='$LID'" >/dev/null
echo "restored    -> $(v | jq -c '{valid,status}')"
echo "-- max_activations enforcement (limit 3) --"
for i in 1 2 3 4; do
  U="$(cat /proc/sys/kernel/random/uuid)"
  C="$(curl -s -o /dev/null -w '%{http_code}' -X POST "$A/api/v1/licenses/activate" -H 'Content-Type: application/json' -d "{\"key\":\"$LK\",\"domain\":\"s${i}-${R}.example.com\",\"installation_uuid\":\"$U\",\"environment\":\"production\",\"product_version\":\"1.0.0\"}")"
  echo "  activation #$((i+1)) -> $C"
done
echo "-- deactivate --"
curl -s -o /dev/null -w "  deactivate -> %{http_code}\n" -X POST "$A/api/v1/licenses/deactivate" -H 'Content-Type: application/json' -d "{\"activation_token\":\"$T\",\"installation_uuid\":\"$IU\"}"
echo "  post-deactivate validate -> $(curl -s -o /dev/null -w '%{http_code}' -X POST "$A/api/v1/licenses/validate" -H 'Content-Type: application/json' -d "{\"activation_token\":\"$T\",\"domain\":\"$D\",\"environment\":\"production\",\"installation_uuid\":\"$IU\"}")"

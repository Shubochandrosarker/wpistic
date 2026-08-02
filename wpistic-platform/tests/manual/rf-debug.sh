#!/usr/bin/env bash
set -uo pipefail
A="http://localhost:8787"
sql() { psql "$DATABASE_URL" -qtAX -c "$1"; }
R="$(openssl rand -hex 4)"; D="rf-${R}.example.com"; IU="$(cat /proc/sys/kernel/random/uuid)"
LK="insightistic_$(openssl rand -hex 16)"
KH="$(printf '%s' "$LK" | openssl dgst -sha256 -hex | awk '{print $NF}')"
ORG="$(sql "INSERT INTO organizations (name,slug,billing_email) VALUES ('RF ${R}','rf-${R}','rf@example.com') RETURNING id")"
PRD="$(sql "SELECT id FROM products WHERE slug='insightistic'")"
PLN="$(sql "SELECT pl.id FROM plans pl JOIN products p ON p.id=pl.product_id WHERE p.slug='insightistic' AND pl.slug='professional'")"
LID="$(sql "INSERT INTO licenses (organization_id,product_id,plan_id,key_hash,key_prefix,key_mask,status,max_activations,expires_at) VALUES ('$ORG','$PRD','$PLN','$KH','insightistic_','insightistic_****${LK: -4}','active',3,NOW()+INTERVAL '30 days') RETURNING id")"
TOK="$(curl -sf -X POST "$A/api/v1/licenses/activate" -H 'Content-Type: application/json' -d "{\"key\":\"$LK\",\"domain\":\"$D\",\"installation_uuid\":\"$IU\",\"environment\":\"production\",\"product_version\":\"1.0.0\"}" | jq -r .activation_token)"
echo "token len: ${#TOK}"
echo "=== REFRESH (full response + status) ==="
curl -s -o /tmp/rf.json -w 'http=%{http_code}\n' -X POST "$A/api/v1/licenses/refresh" -H 'Content-Type: application/json' -d "{\"activation_token\":\"$TOK\"}"
jq . /tmp/rf.json 2>/dev/null || cat /tmp/rf.json
echo "keys: $(jq -r 'keys|join(",")' /tmp/rf.json 2>/dev/null)"
NT="$(jq -r '.activation_token // empty' /tmp/rf.json)"
echo "new token len: ${#NT}"
echo "=== GRACE PERIOD ==="
USE="${NT:-$TOK}"
sql "UPDATE licenses SET expires_at=NOW()-INTERVAL '1 day' WHERE id='$LID'" >/dev/null
curl -s -o /tmp/gr.json -w 'http=%{http_code}\n' -X POST "$A/api/v1/licenses/validate" -H 'Content-Type: application/json' -d "{\"activation_token\":\"$USE\",\"domain\":\"$D\",\"environment\":\"production\",\"installation_uuid\":\"$IU\"}"
jq '{valid,status,grace_period_ends_at,expires_at}' /tmp/gr.json 2>/dev/null || cat /tmp/gr.json
echo "=== PAST GRACE (8 days) ==="
sql "UPDATE licenses SET expires_at=NOW()-INTERVAL '8 days' WHERE id='$LID'" >/dev/null
curl -s -o /tmp/pg.json -w 'http=%{http_code}\n' -X POST "$A/api/v1/licenses/validate" -H 'Content-Type: application/json' -d "{\"activation_token\":\"$USE\",\"domain\":\"$D\",\"environment\":\"production\",\"installation_uuid\":\"$IU\"}"
jq '{valid,status}' /tmp/pg.json 2>/dev/null || cat /tmp/pg.json
sql "UPDATE licenses SET expires_at=NOW()+INTERVAL '30 days', grace_period_ends_at=NULL WHERE id='$LID'" >/dev/null
echo "=== DEACTIVATE (full response + status) ==="
curl -s -o /tmp/de.json -w 'http=%{http_code}\n' -X POST "$A/api/v1/licenses/deactivate" -H 'Content-Type: application/json' -d "{\"activation_token\":\"$USE\",\"installation_uuid\":\"$IU\"}"
jq . /tmp/de.json 2>/dev/null || cat /tmp/de.json
echo "=== POST-DEACTIVATE VALIDATE ==="
curl -s -o /tmp/pd.json -w 'http=%{http_code}\n' -X POST "$A/api/v1/licenses/validate" -H 'Content-Type: application/json' -d "{\"activation_token\":\"$USE\",\"domain\":\"$D\",\"environment\":\"production\",\"installation_uuid\":\"$IU\"}"
cat /tmp/pd.json; echo

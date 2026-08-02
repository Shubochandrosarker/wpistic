#!/usr/bin/env bash
set -euo pipefail
API_URL="${API_URL:-http://localhost:8787}"
sql() { psql "$DATABASE_URL" -qtAX -c "$1"; }
RUN_ID="$(openssl rand -hex 4)"
DOMAIN="dbg-${RUN_ID}.example.com"
INSTALL_UUID="$(cat /proc/sys/kernel/random/uuid)"
LICENSE_KEY="insightistic_$(openssl rand -hex 16)"
KEY_HASH="$(printf '%s' "$LICENSE_KEY" | openssl dgst -sha256 -hex | awk '{print $NF}')"
ORG_ID="$(sql "INSERT INTO organizations (name, slug, billing_email) VALUES ('DBG ${RUN_ID}','dbg-${RUN_ID}','dbg@example.com') RETURNING id")"
PRODUCT_ID="$(sql "SELECT id FROM products WHERE slug='insightistic'")"
PLAN_ID="$(sql "SELECT pl.id FROM plans pl JOIN products p ON p.id=pl.product_id WHERE p.slug='insightistic' AND pl.slug='professional'")"
sql "INSERT INTO licenses (organization_id,product_id,plan_id,key_hash,key_prefix,key_mask,status,max_activations,expires_at) VALUES ('$ORG_ID','$PRODUCT_ID','$PLAN_ID','$KEY_HASH','insightistic_','insightistic_****${LICENSE_KEY: -4}','active',3,NOW()+INTERVAL '30 days') RETURNING id" >/dev/null
ACT="$(curl -sf -X POST "$API_URL/api/v1/licenses/activate" -H 'Content-Type: application/json' -d "{\"key\":\"$LICENSE_KEY\",\"domain\":\"$DOMAIN\",\"installation_uuid\":\"$INSTALL_UUID\",\"environment\":\"production\",\"product_version\":\"1.0.0\"}")"
TOKEN="$(jq -r .activation_token <<<"$ACT")"
VKEY="$(jq -r .verification_key <<<"$ACT")"
printf '%s' "$ACT" > /tmp/activate.json
VAL="$(curl -sf -X POST "$API_URL/api/v1/licenses/validate" -H 'Content-Type: application/json' -d "{\"activation_token\":\"$TOKEN\",\"domain\":\"$DOMAIN\",\"environment\":\"production\",\"installation_uuid\":\"$INSTALL_UUID\"}")"
printf '%s' "$VAL" > /tmp/validate.json
echo "=== RAW VALIDATE RESPONSE ==="
jq . /tmp/validate.json
echo "=== PHP CANONICAL ==="
php -r 'require "/app/wordpress-sdk/src/Security/HmacVerifier.php"; $r=json_decode(file_get_contents("/tmp/validate.json"),true); unset($r["signature"],$r["activation_token"],$r["verification_key"]); $c=\WPistic\Sdk\Security\HmacVerifier::canonical_json($r); echo $c,"\n"; file_put_contents("/tmp/php_canon.txt",$c);'
echo "=== NODE CANONICAL ==="
node -e 'const fs=require("fs");function cj(v){if(v===null||typeof v!=="object")return JSON.stringify(v);if(Array.isArray(v))return "["+v.map(cj).join(",")+"]";const e=Object.entries(v).filter(function(p){return p[1]!==undefined}).sort(function(a,b){return a[0]<b[0]?-1:a[0]>b[0]?1:0});return "{"+e.map(function(p){return JSON.stringify(p[0])+":"+cj(p[1])}).join(",")+"}"}const r=JSON.parse(fs.readFileSync("/tmp/validate.json","utf8"));delete r.signature;delete r.activation_token;delete r.verification_key;const c=cj(r);console.log(c);fs.writeFileSync("/tmp/node_canon.txt",c);'
echo "=== CANONICAL COMPARISON ==="
if cmp -s /tmp/php_canon.txt /tmp/node_canon.txt; then echo "IDENTICAL"; else echo "DIFFERS:"; diff <(fold -w1 /tmp/php_canon.txt) <(fold -w1 /tmp/node_canon.txt) | head -40; fi
echo "=== SIGNATURES ==="
echo "response.signature : $(jq -r .signature /tmp/validate.json)"
php -r 'echo "php expected       : ", bin2hex(hash_hmac("sha256", file_get_contents("/tmp/php_canon.txt"), pack("H*",$argv[1]), true)), "\n";' "$VKEY"
node -e 'const c=require("crypto"),fs=require("fs");console.log("node expected      : "+c.createHmac("sha256",Buffer.from(process.argv[1],"hex")).update(fs.readFileSync("/tmp/node_canon.txt")).digest("hex"))' "$VKEY"
echo "=== ACTIVATE RESPONSE (for comparison) ==="
jq 'del(.activation_token)' /tmp/activate.json

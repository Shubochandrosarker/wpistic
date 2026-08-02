#!/usr/bin/env bash
#
# Golden-path end-to-end test for the WPistic control plane.
#
# Proves one full customer lifecycle against a real running stack:
#   seed → issue license → activate → validate (PHP verifies the HMAC
#   signature) → publish a package → update check → authorize download →
#   download (single-use proven) → refresh (old token revoked) → expiry →
#   grace period → past-grace rejection → deactivate (token revoked).
#
# Prerequisites (run from wpistic-platform/):
#   1. docker compose up -d                # local Postgres
#   2. npm run db:migrate && npm run db:seed
#   3. apps/api/.dev.vars with LICENSE_SIGNING_SECRET, LICENSE_JWT_PRIVATE_KEY,
#      LICENSE_JWT_PUBLIC_KEY, ADMIN_API_TOKEN (and the other secrets)
#   4. npm run dev:api                     # wrangler dev on :8787
#
# Usage:
#   ADMIN_API_TOKEN=<same value as .dev.vars> tests/e2e/golden-path.sh
#
# Optional env: API_URL (default http://127.0.0.1:8787),
#               DATABASE_URL (default postgresql://wpistic:password@localhost:5432/wpistic)
set -euo pipefail

API_URL="${API_URL:-http://127.0.0.1:8787}"
DATABASE_URL="${DATABASE_URL:-postgresql://wpistic:password@localhost:5432/wpistic}"
ADMIN_API_TOKEN="${ADMIN_API_TOKEN:?Set ADMIN_API_TOKEN to the value in apps/api/.dev.vars}"

for cmd in curl jq psql openssl; do
  command -v "$cmd" >/dev/null || { echo "FATAL: $cmd is required"; exit 1; }
done

PASS=0
step() { printf '\n\033[1m== %s ==\033[0m\n' "$1"; }
ok()   { PASS=$((PASS + 1)); printf '   \033[32mOK\033[0m %s\n' "$1"; }
fail() { printf '   \033[31mFAIL\033[0m %s\n' "$1"; exit 1; }

sql() { psql "$DATABASE_URL" -qtAX -c "$1"; }

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

RUN_ID="$(openssl rand -hex 4)"
DOMAIN="e2e-${RUN_ID}.example.com"
INSTALL_UUID="$(cat /proc/sys/kernel/random/uuid 2>/dev/null || uuidgen)"
E2E_VERSION="99.${RANDOM}.0"

# ---------------------------------------------------------------------------
step "0. API is up"
# ---------------------------------------------------------------------------
curl -sf "$API_URL/health" >/dev/null || fail "GET /health — is 'npm run dev:api' running?"
ok "GET /health"

# ---------------------------------------------------------------------------
step "1. Seed org + license (Insightistic / Professional)"
# ---------------------------------------------------------------------------
LICENSE_KEY="insightistic_$(openssl rand -hex 16)"
KEY_HASH="$(printf '%s' "$LICENSE_KEY" | openssl dgst -sha256 -hex | awk '{print $NF}')"

ORG_ID="$(sql "INSERT INTO organizations (name, slug, billing_email)
               VALUES ('E2E ${RUN_ID}', 'e2e-${RUN_ID}', 'e2e@example.com') RETURNING id")"
PRODUCT_ID="$(sql "SELECT id FROM products WHERE slug = 'insightistic'")"
PLAN_ID="$(sql "SELECT pl.id FROM plans pl JOIN products p ON p.id = pl.product_id
                WHERE p.slug = 'insightistic' AND pl.slug = 'professional'")"
[ -n "$PRODUCT_ID" ] && [ -n "$PLAN_ID" ] || fail "seed data missing — run npm run db:seed"

LICENSE_ID="$(sql "INSERT INTO licenses (organization_id, product_id, plan_id, key_hash, key_prefix, key_mask,
                                         status, max_activations, expires_at)
                   VALUES ('$ORG_ID', '$PRODUCT_ID', '$PLAN_ID', '$KEY_HASH', 'insightistic_',
                           'insightistic_****${LICENSE_KEY: -4}', 'active', 3, NOW() + INTERVAL '30 days')
                   RETURNING id")"
ok "license $LICENSE_ID issued (org $ORG_ID)"

# ---------------------------------------------------------------------------
step "2. Activate (as the WordPress plugin would)"
# ---------------------------------------------------------------------------
ACTIVATE="$(curl -sf -X POST "$API_URL/api/v1/licenses/activate" -H 'Content-Type: application/json' -d "{
  \"key\": \"$LICENSE_KEY\", \"domain\": \"$DOMAIN\", \"installation_uuid\": \"$INSTALL_UUID\",
  \"environment\": \"production\", \"product_version\": \"1.0.0\"
}")" || fail "activate"
[ "$(jq -r '.valid' <<<"$ACTIVATE")" = "true" ] || fail "activate returned valid=false: $ACTIVATE"
TOKEN="$(jq -r '.activation_token' <<<"$ACTIVATE")"
VERIFICATION_KEY="$(jq -r '.verification_key' <<<"$ACTIVATE")"
[ "${#TOKEN}" -gt 100 ] || fail "no activation token"
[[ "$VERIFICATION_KEY" =~ ^[a-f0-9]{64}$ ]] || fail "verification_key is not 64-char hex"
ok "activated; RS256 token + hex verification key received"

# ---------------------------------------------------------------------------
step "3. Validate + PHP-side HMAC signature verification"
# ---------------------------------------------------------------------------
VALIDATE="$(curl -sf -X POST "$API_URL/api/v1/licenses/validate" -H 'Content-Type: application/json' -d "{
  \"activation_token\": \"$TOKEN\", \"domain\": \"$DOMAIN\",
  \"environment\": \"production\", \"installation_uuid\": \"$INSTALL_UUID\"
}")" || fail "validate"
[ "$(jq -r '.valid' <<<"$VALIDATE")" = "true" ] || fail "validate returned valid=false: $VALIDATE"
ok "validate → valid=true"

if command -v php >/dev/null; then
  printf '%s' "$VALIDATE" >"$TMP_DIR/validate.json"
  SDK_DIR="$(cd "$(dirname "$0")/../.." && pwd)/wordpress-sdk"
  php -r '
    require $argv[1] . "/src/Security/HmacVerifier.php";
    $response = json_decode(file_get_contents($argv[2]), true);
    exit(\WPistic\Sdk\Security\HmacVerifier::verify($response, $argv[3]) ? 0 : 1);
  ' "$SDK_DIR" "$TMP_DIR/validate.json" "$VERIFICATION_KEY" \
    || fail "PHP HmacVerifier rejected the API's signature — cross-language contract broken"
  ok "PHP HmacVerifier accepted the exact signature TypeScript produced"
else
  echo "   SKIP php not installed — HMAC cross-check covered by unit golden vectors"
fi

# ---------------------------------------------------------------------------
step "4. Publish an update package (streaming upload, no base64)"
# ---------------------------------------------------------------------------
PKG_ZIP="$TMP_DIR/pkg.zip"
printf 'PK\x05\x06%s' "$(head -c 100 /dev/urandom | base64)" >"$PKG_ZIP"
PKG_SHA="$(openssl dgst -sha256 -hex <"$PKG_ZIP" | awk '{print $NF}')"

UPLOAD="$(curl -sf -X PUT "$API_URL/api/v1/admin/packages/upload?product_slug=insightistic&version=$E2E_VERSION" \
  -H "Authorization: Bearer $ADMIN_API_TOKEN" -H "x-package-checksum: $PKG_SHA" \
  -H 'Content-Type: application/zip' --data-binary "@$PKG_ZIP")" || fail "streaming upload"
PKG_PATH="$(jq -r '.package_path' <<<"$UPLOAD")"
ok "uploaded to R2 at $PKG_PATH (R2 verified sha256)"

REGISTER="$(curl -sf -X POST "$API_URL/api/v1/admin/packages" \
  -H "Authorization: Bearer $ADMIN_API_TOKEN" -H 'Content-Type: application/json' -d "{
  \"product_slug\": \"insightistic\", \"version\": \"$E2E_VERSION\",
  \"package_path\": \"$PKG_PATH\", \"checksum\": \"$PKG_SHA\", \"channel\": \"stable\"
}")" || fail "register package"
PKG_ID="$(jq -r '.package.id' <<<"$REGISTER")"
curl -sf -X POST "$API_URL/api/v1/admin/packages/$PKG_ID/publish" \
  -H "Authorization: Bearer $ADMIN_API_TOKEN" >/dev/null || fail "publish package"
ok "package $E2E_VERSION registered + published"

# ---------------------------------------------------------------------------
step "5. Update check sees the new version"
# ---------------------------------------------------------------------------
UPDATES="$(curl -sf "$API_URL/api/v1/products/insightistic/updates?version=1.0.0&channel=stable&activation_token=$TOKEN&installation_uuid=$INSTALL_UUID")" || fail "update check"
[ "$(jq -r '.available' <<<"$UPDATES")" = "true" ] || fail "no update offered: $UPDATES"
[ "$(jq -r '.version' <<<"$UPDATES")" = "$E2E_VERSION" ] || fail "wrong version offered"
ok "update $E2E_VERSION offered"

# ---------------------------------------------------------------------------
step "6. Authorize download — activation token ONLY (no raw license key)"
# ---------------------------------------------------------------------------
AUTHORIZE="$(curl -sf -X POST "$API_URL/api/v1/downloads/authorize" -H 'Content-Type: application/json' -d "{
  \"activation_token\": \"$TOKEN\", \"product_slug\": \"insightistic\", \"requested_version\": \"$E2E_VERSION\"
}")" || fail "authorize download"
DL_URL="$(jq -r '.download_url' <<<"$AUTHORIZE")"
[[ "$DL_URL" == *"token=dl_"* ]] || fail "no dl_ token in download_url: $AUTHORIZE"
ok "download authorized with activation token alone"

# ---------------------------------------------------------------------------
step "7. Download once, checksum matches; replay is rejected"
# ---------------------------------------------------------------------------
curl -sf "$DL_URL" -o "$TMP_DIR/downloaded.zip" || fail "download"
GOT_SHA="$(openssl dgst -sha256 -hex <"$TMP_DIR/downloaded.zip" | awk '{print $NF}')"
[ "$GOT_SHA" = "$PKG_SHA" ] || fail "downloaded checksum mismatch"
ok "downloaded; sha256 matches"

REPLAY_CODE="$(curl -s -o /dev/null -w '%{http_code}' "$DL_URL")"
[ "$REPLAY_CODE" = "403" ] || fail "replayed token got $REPLAY_CODE, expected 403 (single-use broken)"
ok "replayed token → 403 (atomic single-use grant)"

# ---------------------------------------------------------------------------
step "8. Refresh rotates the token and revokes the old one"
# ---------------------------------------------------------------------------
REFRESH="$(curl -sf -X POST "$API_URL/api/v1/licenses/refresh" -H 'Content-Type: application/json' \
  -d "{\"activation_token\": \"$TOKEN\"}")" || fail "refresh"
NEW_TOKEN="$(jq -r '.activation_token' <<<"$REFRESH")"
[ "$NEW_TOKEN" != "$TOKEN" ] || fail "refresh returned the same token"

OLD_CODE="$(curl -s -o /dev/null -w '%{http_code}' -X POST "$API_URL/api/v1/licenses/validate" \
  -H 'Content-Type: application/json' -d "{
  \"activation_token\": \"$TOKEN\", \"domain\": \"$DOMAIN\",
  \"environment\": \"production\", \"installation_uuid\": \"$INSTALL_UUID\"}")"
[ "$OLD_CODE" = "401" ] || [ "$OLD_CODE" = "403" ] || fail "old token still accepted ($OLD_CODE)"
TOKEN="$NEW_TOKEN"
ok "token rotated; old token revoked ($OLD_CODE)"

# ---------------------------------------------------------------------------
step "9. Expiry → grace period → past grace → invalid"
# ---------------------------------------------------------------------------
sql "UPDATE licenses SET expires_at = NOW() - INTERVAL '1 day' WHERE id = '$LICENSE_ID'" >/dev/null
GRACE="$(curl -sf -X POST "$API_URL/api/v1/licenses/validate" -H 'Content-Type: application/json' -d "{
  \"activation_token\": \"$TOKEN\", \"domain\": \"$DOMAIN\",
  \"environment\": \"production\", \"installation_uuid\": \"$INSTALL_UUID\"}")" || fail "grace validate"
[ "$(jq -r '.status' <<<"$GRACE")" = "grace_period" ] || fail "expected grace_period, got: $(jq -c . <<<"$GRACE")"
ok "1 day past expiry → grace_period"

sql "UPDATE licenses SET expires_at = NOW() - INTERVAL '8 days' WHERE id = '$LICENSE_ID'" >/dev/null
PAST="$(curl -s -X POST "$API_URL/api/v1/licenses/validate" -H 'Content-Type: application/json' -d "{
  \"activation_token\": \"$TOKEN\", \"domain\": \"$DOMAIN\",
  \"environment\": \"production\", \"installation_uuid\": \"$INSTALL_UUID\"}")"
[ "$(jq -r '.valid' <<<"$PAST" 2>/dev/null)" != "true" ] || fail "license still valid 8 days past expiry"
ok "8 days past expiry → not valid"

sql "UPDATE licenses SET expires_at = NOW() + INTERVAL '30 days' WHERE id = '$LICENSE_ID'" >/dev/null

# ---------------------------------------------------------------------------
step "10. Deactivate revokes the activation token"
# ---------------------------------------------------------------------------
curl -sf -X POST "$API_URL/api/v1/licenses/deactivate" -H 'Content-Type: application/json' -d "{
  \"activation_token\": \"$TOKEN\", \"installation_uuid\": \"$INSTALL_UUID\"}" >/dev/null || fail "deactivate"
DEAD_CODE="$(curl -s -o /dev/null -w '%{http_code}' -X POST "$API_URL/api/v1/licenses/validate" \
  -H 'Content-Type: application/json' -d "{
  \"activation_token\": \"$TOKEN\", \"domain\": \"$DOMAIN\",
  \"environment\": \"production\", \"installation_uuid\": \"$INSTALL_UUID\"}")"
[ "$DEAD_CODE" = "401" ] || [ "$DEAD_CODE" = "403" ] || fail "deactivated token still accepted ($DEAD_CODE)"
ok "deactivated; token rejected ($DEAD_CODE)"

printf '\n\033[32m✔ Golden path complete — %d checks passed.\033[0m\n' "$PASS"

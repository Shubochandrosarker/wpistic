#!/usr/bin/env bash
# Runs golden-path.sh but downgrades the known PHP-HMAC failure to a warning,
# so steps 4-10 (packages, updates, downloads, refresh, grace, deactivate)
# actually get exercised instead of the script aborting at step 3.
set -uo pipefail
sed -e 's#|| fail "PHP HmacVerifier rejected the API.s signature — cross-language contract broken"#|| echo "   KNOWN-FAIL(bypassed): PHP rejected signature"#' \
    /app/tests/e2e/golden-path.sh > /tmp/gp.sh
echo "--- bypass applied at: ---"
grep -n "KNOWN-FAIL" /tmp/gp.sh || { echo "SED DID NOT MATCH"; exit 9; }
echo "--------------------------"
API_URL=http://localhost:8787 bash /tmp/gp.sh

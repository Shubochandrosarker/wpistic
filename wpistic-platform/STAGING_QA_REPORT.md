# WPistic Platform — Local Staging Deployment & Production Readiness Report

**Repo:** `Shubochandrosarker/wpistic` @ `8e0a9e5` (PR #13 merged into `main`)
**Environment:** Docker staging stack on Windows (Docker Desktop), 2026-08-02
**Tested by:** live execution against the running stack — every finding below has reproducible evidence

> **⚠️ Historical — superseded.** This report describes `8e0a9e5`. PR #14 closed all five blockers
> (B1–B5) and H1–H3; H5, M1 (for `apps/account`) and M4 remain open. Re-verified against `4605e40`
> by live execution — see [`docs/STAGING_REVERIFICATION.md`](docs/STAGING_REVERIFICATION.md) for
> current status. Keep this file for the original evidence and root-cause analysis.

---

## 1. Deployment status

**Complete and running.** Five containers, all healthy:

| Service | Port | Status |
|---|---|---|
| `wpistic-staging-postgres` | 5433 | healthy |
| `wpistic-staging-api` (wrangler dev, Miniflare KV/R2/Queues/Hyperdrive) | 8787 | healthy |
| `wpistic-staging-account` | 8788 | healthy |
| `wpistic-staging-dashboard` (Vite) | 5173 | healthy |
| `wpistic-staging-admin` (Astro SSR) | 4321 | healthy |

- 13/13 migrations applied to a fresh database, 2/2 seed files applied, idempotent on re-run.
- Note: your dev Postgres on **5432** is a *separate* container (`wpistic-postgres`). The staging stack uses **5433** and its own volume. Both coexist correctly.
- One caveat: **the browser login flow cannot complete locally** — see H2. The stack is up, but a human cannot sign into the staging dashboard through the UI.

### Test results

| Suite | Result |
|---|---|
| `apps/api` vitest | **105/105 pass** |
| `staging-smoke.mjs` (breadth) | **31 pass / 1 fail** (JWKS 500) |
| `golden-path.sh` (licensing lifecycle) | **aborts at step 3** — PHP rejects the API's HMAC signature |
| Custom journey (register→OAuth→API→tenancy) | 29 pass / 5 fail |
| `packages/platform-sdk` tests | **do not exist** — no `test` script, no test files |
| `wordpress-sdk` PHPUnit | cannot run in the staging image (`vendor/` not installed) |

> PR #13's description claims *"API (105/105), Platform SDK (147/147), Root SDK (25 passing)"* and *"the golden-path e2e test validates the complete lifecycle against local Docker and wrangler dev."* The API number is accurate. The Platform SDK number does not correspond to anything in the repo. The golden-path claim is **not true** — it fails at step 3 against this exact stack.

---

## 2. Honest verdict

The **architecture is genuinely good** — better than most solo-built SaaS platforms I've seen at this stage. The **execution has five production blockers**, and they cluster in one revealing place: everything that was verified by a unit test works; everything that was only verified *across a boundary* is broken.

The unit tests pass because they use hand-built fixtures. The real system fails because real Postgres returns `Date` objects, real JWTs are deterministic, real Hono middleware doesn't see route params, and the real admin portal has no door on it. **CI never runs the one test that crosses those boundaries** (`golden-path.sh`), which is exactly why PR #13 shipped believing the HMAC contract was fixed.

Blunt summary: **do not put this in front of paying customers yet.** It is roughly 2–3 focused days from being able to.

---

## 3. Blockers — must fix before production

### B1. The admin portal has no authentication whatsoever 🔴 CRITICAL

**Evidence:** loaded `http://localhost:4321/customers` in a browser with no credentials and got the full customer table — 17 organisations, owner emails, member counts, subscription status. Same for `/invoices`, `/licenses`, `/subscriptions`, `/audit`. There is no login page, no session check, no middleware anywhere in `apps/admin/src`.

Every page calls `adminGet()` server-side with the baked-in `ADMIN_API_TOKEN` and `X-Admin-Role: super_admin`.

**It gets worse.** `apps/admin/src/pages/api/proxy.ts` is an **unauthenticated POST endpoint** that forwards to admin mutation routes with `super_admin`:

```
/licenses/{uuid}/action          → suspend | reactivate | revoke | reset_activations
/subscriptions/{uuid}/cancel
/organizations/{uuid}/grant
/webhooks/{uuid}/retry
```

I proved it is reachable without credentials (using a non-existent UUID and an invalid action, so nothing was mutated) — the API returned its Zod validation error listing the valid actions, which means the request passed `requireAdmin` and reached the handler:

```
POST http://localhost:4321/api/proxy  (no auth header)
{"endpoint":"/licenses/00000000-0000-4000-8000-000000000000/action","body":{"action":"noop"}}
→ {"issues":[{"received":"noop","options":["suspend","reactivate","revoke","reset_activations"] ...
```

**Impact:** anyone who can reach `admin.wpistic.com` can read every customer's data and **revoke any license, cancel any subscription, and grant themselves entitlements** — with no credentials. The only stated protection is `wrangler.jsonc`'s comment: *"Optionally protect the whole hostname with Cloudflare Access."* A single edge toggle, described as optional, is the entire security model for your staff portal.

**Also:** `adminAudit()` writes `user_id = NULL` for admin-token actions. So the audit log records *what* happened but never *who* did it. The README's "everything audited as `actor_type='admin'`" is technically true and practically useless.

**Fix (do all three):**
1. Put Cloudflare Access in front of `admin.wpistic.com` — mandatory, not optional.
2. Add app-level staff auth: staff JWT from `account.wpistic.com`, checked against `ADMIN_EMAILS`, plus fresh TOTP. Enforce it in an Astro middleware covering all pages **and** `/api/proxy`.
3. Attribute the acting staff user in `adminAudit()` instead of `NULL`.

---

### B2. Every time-limited license fails offline HMAC verification 🔴 CRITICAL

This is the bug PR #13 claimed to fix. It did not.

**Evidence:**

```
server signature      : 3152d5f13d6b8e328254e53cf56e0424003cd772ea690e7197fa820e935897a2
PHP  computed         : ffbb602c28f23ed7bc3929974c0577c111fc3c7096522a8022c80aff8998df66
Node computed         : ffbb602c28f23ed7bc3929974c0577c111fc3c7096522a8022c80aff8998df66
CANONICAL COMPARISON  : IDENTICAL          ← canonicalisation is fine
canon(expires_at=Date): 3152d5f1...        ← MATCHES the server
```

**Root cause:** `postgres.js` returns `timestamptz` as a JS `Date`. `LicenseRow.expires_at` is *typed* `string | null` but is a `Date` at runtime. In `canonicalJson()`, a `Date` falls into the `typeof value === 'object'` branch, `Object.entries(date)` is `[]`, so the signed payload contains `"expires_at":{}` — while the JSON actually sent to the plugin contains the ISO string.

**Impact:** every WordPress plugin in the field rejects the signature on every license that has an expiry date. Only lifetime licenses (`expires_at: null`) verify. This silently breaks your entire offline-verification story — the thing that lets plugins keep working without hammering your API.

**Why it slipped through:** `crypto.test.ts` and `HmacVerifierTest.php` both sign hand-built objects with string dates. Neither ever sees a Postgres row.

**Fix** — `apps/api/src/utils/crypto.ts`:

```ts
export function canonicalJson(value: unknown): string {
  if (value instanceof Date) return JSON.stringify(value.toISOString()); // ← add
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  ...
}
```

Then add a regression test that signs an object containing a real `Date` and asserts the PHP verifier accepts it.

---

### B3. Refresh can mint a token identical to the one it just revoked 🔴 CRITICAL

**Evidence:**

```
[same-second] delay=0s  new-token-vs-old=IDENTICAL  validate(new)=401
              iat(old)=1785669055  iat(new)=1785669055
[after-2s]    delay=2s  new-token-vs-old=different  validate(new)=200
              immediate 2nd refresh: new-vs-prev=IDENTICAL  validate=401
```

**Root cause:** RS256 (RSASSA-PKCS1-v1_5) is **deterministic** — same header + same payload produces the same signature byte-for-byte. `ActivationTokenClaims` contains no nonce, and `iat`/`exp` have one-second resolution. `refresh()` revokes the presented token's hash *before* minting the replacement, so if both land in the same wall-clock second the replacement **is** the revoked token.

**Impact:** the installation is permanently locked out and needs manual re-activation. Realistic triggers: plugin retries `refresh` after a network timeout; cron and a manual check race; any `activate` → `refresh` within one second.

**Fix** — `apps/api/src/utils/crypto.ts`, in `signActivationToken()`:

```ts
return new SignJWT({ ...claims })
  .setProtectedHeader({ alg: 'RS256' })
  .setJti(randomHex(16))          // ← add: makes every token unique
  .setSubject(claims.sub)
  ...
```

---

### B4. The `:orgId` path parameter is silently ignored on every org-scoped route 🔴 HIGH

**Evidence:** planted exactly one license in `org2`, none in `org1`, as a user who owns both:

```
GET /organizations/{org1}/licenses      -> 200, 0 licenses   (org1 has 0)
GET /organizations/{org2}/licenses      -> 200, 0 licenses   ← WRONG, org2 has 1
GET /organizations/{org2}/licenses +hdr -> 200, 1 licenses   ← correct only via header
GET /organizations/00000000-.../licenses-> 200               ← nonexistent org, no error
GET /organizations/' OR 1=1--/licenses  -> 200               ← UUID validation never runs
```

**Root cause:** `injectOrgContext` is registered as global middleware. Inside middleware matched on `*`, Hono's `c.req.param('orgId')` is `undefined` — the middleware's own matched pattern has no params. So `requested` falls through to `X-Organization-Id`, then the token's `org_id` claim. The URL segment is decorative.

**Impact:** this is not a cross-*user* data leak — you only ever see orgs your own token points at. But for any user in more than one organisation — **agencies managing client orgs, your stated core market** — the dashboard shows the *wrong organisation's* licenses, billing, invoices, websites, AI credits and audit log, with a cheerful HTTP 200. Mutating routes (`/members`, `/api-keys`, `/billing`) are on the same code path, so an action intended for org B can land on org A.

Secondary effect: the membership check and UUID validation the code comments describe for the param path are dead code.

**Fix** — `apps/api/src/middleware/tenant.ts`:

```ts
const pathOrgId = /^\/api\/v1\/organizations\/([0-9a-f-]{36})/i.exec(c.req.path)?.[1];
const requested = pathOrgId ?? c.req.param('orgId') ?? headerOrgId ?? c.get('tokenOrgId') ?? null;
```

Then add a test asserting a two-org user gets org-B data from an org-B URL.

---

### B5. The 7-day grace period never activates on the validate path 🔴 HIGH

**Evidence:**

```
active      -> {"valid":true,"status":"active"}
expired 1d  -> {"valid":false,"status":"expired","grace_period_ends_at":null}   ← expected grace_period
expired 3d  -> {"valid":false,"status":"expired"}
expired 8d  -> {"valid":false,"status":"expired"}
```

**Root cause:** `ensureLifecycleFresh()` — the function that pins `grace_period_ends_at` to expiry + 7 days — is called only from `activate()` (line 189) and `refresh()` (line 336). `validate()` calls `buildValidationResponse()`, which uses the plain `evaluateLicenseLifecycle()`. With `grace_period_ends_at` still `NULL`, a past-expiry license evaluates straight to `expired`.

**Impact:** plugins call `validate` every 12 hours (`check_after: 43200`); `refresh` only at token rotation. So in the normal cadence, a customer whose renewal payment is one day late gets premium features **cut instantly** — contradicting the README's grace-period promise, the `grace_period_days: 7` field you return in every response, and your own golden-path test's expectation.

**Fix** — `apps/api/src/modules/licenses/service.ts`, in `validate()`:

```ts
await this.ensureLifecycleFresh(license);   // ← add before building the response
return this.buildValidationResponse(license, activation);
```

Apply the same in `modules/updates/routes.ts` (lines 41 and 107).

---

## 4. High priority

### H1. JWKS endpoint returns 500 — federated SSO cannot work

```
GET /.well-known/jwks.json → 500
TypeError: non-extractable CryptoKey cannot be exported as a JWK
    at keyToJWK → exportJWK → getJwks
```

`importSPKI()` defaults to `extractable: false`; `exportJWK()` then throws. The OIDC discovery document advertises `jwks_uri`, so any relying party that does discovery gets a 500. Your next milestone is "product-app SSO rollout (Insightistic first)" — that rollout is blocked by this.

**Fix** — `apps/account/src/auth/tokens.ts`:
```ts
publicKeyPromise ??= importSPKI(normalizePem(env.JWT_PUBLIC_KEY), ALG, { extractable: true });
```

### H2. Public URLs are derived from the request Host — staging escapes to production

Both `download_url` and the post-login `continue` URL are built with `new URL(c.req.url).origin`. Under `wrangler dev` this resolves to the hostname in `routes`, i.e. **your live production domain**.

Observed in the staging stack:
```
POST /api/v1/downloads/authorize
→ {"download_url":"http://api.wpistic.com/api/v1/downloads/file?token=dl_..."}
```

And in the browser: I signed into the staging login page at `localhost:8788` and the browser was redirected to **the real `https://account.wpistic.com/authorize`**, landing on the live Cloudflare bot-check page. The staging login flow leaves localhost and hits the public internet.

Consequences: downloads and browser login are untestable locally (this is why `golden-path.sh` step 7 fails), and in production the value depends on the inbound `Host` header rather than configuration.

**Fix:** add `PUBLIC_API_URL` / `PUBLIC_ACCOUNT_URL` vars per environment and build absolute URLs from those, never from `c.req.url`.

### H3. Rate limiter fails open under exactly the load it exists to stop

130 concurrent requests to `/api/v1/me` produced **zero 429s** (`{"200":101,"500":29}`), against a documented limit of 100/min/IP.

`bump()` is a KV `get` → `+1` → `put`. Under concurrency every request reads the same value before any write lands, so the counter barely moves. It works for sequential traffic and does nothing during a burst.

**Fix:** Cloudflare Rate Limiting rules at the edge, the native rate-limit binding, or a Durable Object counter. KV cannot do atomic increments.

### H4. Database connection exhaustion under load

The same burst produced **29 × HTTP 500** — `PostgresError: sorry, too many clients already`, thrown from `setOrgRlsContext`.

`createDb()` builds a new `postgres()` client per request with `max: 1` and no shared pool, so N concurrent requests = N connections. Hyperdrive pools in production and will mask most of this, but the shape is wrong and there is no graceful degradation — you get 500s, not 503s with `Retry-After`.

Note the extra `set_config` round-trip on every authenticated request currently buys nothing (see H5).

### H5. Row Level Security is enabled but completely inert

```
current_user = wpistic
rolname     | rolsuper | rolbypassrls
wpistic     | t        | t             ← the app connects as this
wpistic_app | f        | f             ← the intended runtime role, unused
11 tables: rls_enabled = t, rls_forced = f
```

Postgres does not apply RLS to superusers or table owners unless `FORCE ROW LEVEL SECURITY` is set. The API connects as `wpistic` — superuser with `BYPASSRLS`. So the "defence-in-depth tenant isolation safety net" the README advertises is **switched off, and has never once been exercised**. Switching production to `wpistic_app` would be an entirely untested change against policies nobody has validated.

Second issue: `setOrgRlsContext` uses `set_config('app.current_org_id', $1, false)` — `false` means session-scoped, not transaction-scoped. On a pooled connection, org context can survive into a later request that fails to set it. `withOrg()` in `db.ts` correctly uses `true`; the middleware does not.

**Fix:** create `wpistic_app`, grant DML only, point `DATABASE_URL` at it, add `FORCE ROW LEVEL SECURITY`, switch the middleware to transaction-scoped `set_config` — then run the whole suite again, because this *will* surface queries that were silently relying on bypass.

---

## 5. Medium priority

| # | Finding |
|---|---|
| M1 | **Test coverage is far thinner than claimed.** Only `apps/api` has tests (105, passing). `packages/platform-sdk` has no `test` script and no test files — PR #13's "147/147" is not reproducible. `apps/account` — the entire OAuth 2.1 / OIDC / MFA / session service — has **zero tests**. |
| M2 | **CI never runs `golden-path.sh`** — the only test that crosses the TS↔PHP boundary. Both sides' unit tests pass on hand-built vectors, which is precisely how B2 shipped. Wire it into `wpistic-platform-ci.yml` with a Postgres service. |
| M3 | `X-Admin-Role` is client-supplied and unverified. Currently constrained to a known set and defaulting to least privilege (good), but it becomes a real privilege escalation the moment any code branches on it. |
| M4 | **Transactional email is a stub.** Password reset, invitations and owner notifications no-op silently unless `EMAIL_WEBHOOK_URL` is set. Not a code defect, but a hard launch blocker — customers cannot reset passwords. |
| M5 | The staging image installs `php-cli` specifically to run the SDK's HMAC cross-check, but never installs Composer deps, so `wordpress-sdk` PHPUnit cannot run there. |
| M6 | Admin audit rows store `user_id = NULL` for admin-token actions — no actor attribution (see B1). |
| M7 | `/ai-credits` has no index route (only `/balance`, `/ledger`); a zero balance reports `updated_at: 1970-01-01`. Cosmetic. |

---

## 6. What is genuinely good

Being fair, because a lot here is strong:

- **Architecture.** Modular monolith with real module boundaries, organisation-first tenancy, entitlement-driven authorisation (`entitlements->allows(...)`, never `plan === 'agency'`), transactional outbox for domain events. These are correct choices, not fashionable ones.
- **Database discipline.** 13 migrations apply cleanly to a fresh database; `schema.sql` drift is CI-enforced with a diff gate. Better hygiene than most teams twice your size.
- **Auth gates are tight.** Verified live: unauthenticated → 401; garbage bearer → 401; admin token used outside `/admin/*` → 403; unknown `/api/v1/*` path → 401 not 404 (no anonymous route enumeration); unknown public route → 404 with a correlation id.
- **OAuth 2.1 + PKCE is correctly implemented** — the part everyone gets wrong. Verified: authorization codes are single-use, wrong `code_verifier` rejected, unregistered `redirect_uri` rejected, `id_token` and `refresh_token` issued properly.
- **Error hygiene.** No stack traces, no SQL, no secrets in any error body I could provoke. Correlation id on every response. Security headers present.
- **Licensing core works.** Activation, `max_activations` enforcement (4th activation on a limit of 3 → 409), single-use download grants (replay → 403, atomically), R2 streaming upload with server-side sha256 verification, download checksum matches byte-for-byte, deactivation revokes the token immediately (→ 401).
- **The admin portal UI is excellent** — fast SSR, real data, clean dark/gold design. It just needs a door on it.
- **The staging harness itself is well engineered.** One shared image with per-service commands, an entrypoint that renders `.dev.vars` from env, a generator that mints throwaway RSA keypairs, `--test-scheduled` so cron is reachable. This is better than most teams' local setups — whoever built it knew what they were doing.

---

## 7. Recommended order of work

**Day 1 — the five blockers (all small, high leverage)**
1. B1 admin auth — Cloudflare Access + app-level staff session + `/api/proxy` gate *(largest of the five)*
2. B2 `canonicalJson` Date handling — 1 line + regression test
3. B3 `.setJti()` on activation tokens — 1 line
4. B5 `ensureLifecycleFresh()` in `validate()` — 1 line + 2 in updates routes
5. B4 org id from path in `injectOrgContext` — ~3 lines

**Day 2 — high priority**
6. H1 `extractable: true` — 1 line
7. H2 `PUBLIC_API_URL` / `PUBLIC_ACCOUNT_URL` vars, remove all `c.req.url` origin derivation
8. H3 move rate limiting to the edge / Durable Object
9. H5 switch to `wpistic_app` + `FORCE ROW LEVEL SECURITY` + transaction-scoped `set_config`, then re-run everything

**Day 3 — make it stick**
10. M2 wire `golden-path.sh` into CI with a Postgres service — this is the single highest-value change on the list, because it is the test that would have caught B2, B3, B5 and H2 before they merged
11. M4 wire up real transactional email
12. M1 tests for `apps/account` (OAuth/session/MFA), which currently has none
13. H4 connection handling + graceful 503s under load

---

## 8. Reproduction scripts

Everything above is reproducible. The scripts I wrote are in `wpistic-platform/tests/manual/`:

| Script | Proves |
|---|---|
| `hmac-debug.sh` | B2 — dumps server signature vs PHP vs Node canonical forms |
| `rf2-debug.sh` | B3 — refresh determinism matrix (same-second vs 2s apart) |
| `orgparam.mjs` | B4 — plants a license in org2, shows org1's data returned |
| `grace-debug.sh` | B5 — grace period + `max_activations` + deactivate |
| `journey.mjs` | Full register → login → OAuth PKCE → API → tenancy → rate limit |
| `dl2-debug.sh` | Download single-use, checksum, replay 403 (with the H2 host rewrite) |
| `run-gp.sh` | Runs `golden-path.sh` with the known PHP failure downgraded, so steps 4–10 execute |

Run the shell ones inside the API container:
```bash
docker exec -i wpistic-staging-api bash -c "cat > /tmp/x.sh; sed -i 's/\r$//' /tmp/x.sh; bash /tmp/x.sh" < tests/manual/<script>.sh
```
Run the `.mjs` ones from `wpistic-platform/` on the host: `node tests/manual/<script>.mjs`

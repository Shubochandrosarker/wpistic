# Staging Re-verification — post-PR #14

**Repo:** `Shubochandrosarker/wpistic` @ `4605e40` (PR #14 merged into `main`)
**Date:** 2026-08-02
**Purpose:** re-run the evidence behind `STAGING_QA_REPORT.md` (written against `8e0a9e5`) and record which findings PR #14 actually closed.

Every line below is live execution against a running stack, not a code read.

---

## 1. How this run differed from the original

Docker Hub's blob CDN (`production.cloudfront.docker.com`) is blocked by egress policy in the
environment this re-run happened in, so `docker compose -f docker-compose.staging.yml up` could not
pull `postgres:16-alpine`. The stack was instead reproduced natively with the same inputs:

| Component | Original | This run |
|---|---|---|
| Postgres 16 | `postgres:16-alpine` container, port 5433 | local `postgresql-16` cluster, port 5433 |
| api / account | `wrangler dev` in container | `docker/entrypoint.sh api\|account` natively (same script, same `.dev.vars` rendering) |
| dashboard / admin | container | `vite` / `astro dev` natively |
| env | `.env.staging` via compose `--env-file` | same file, parsed verbatim (bash `source` cannot read it — PEM headers contain spaces) |

Two incidental deltas caused by running natively rather than in separate network namespaces, both
harness artifacts and **not** repo defects:

- both Workers default to inspector port 9229 and collide; the second needs `--inspector-port 9230`.
- Hyperdrive's local connection string rejects a passwordless URL, so the role needed a password.

## 2. Test results

| Suite | Original | This run |
|---|---|---|
| `apps/api` vitest | 105/105 pass | **107/107 pass** |
| `wordpress-sdk` PHPUnit | could not run (no `vendor/`) | **147/147 pass, 208 assertions** |
| `packages/platform-sdk` vitest | did not exist | **2/2 pass** |
| `tests/e2e/staging-smoke.mjs` | 31 pass / 1 fail (JWKS 500) | **32/32 pass** |
| `tests/e2e/golden-path.sh` | aborted at step 3 | **15/15 checks pass** |
| migrations / seeds | 13 + 2 | **14 applied clean, 3 seeds** |

The PR #13 "147/147" figure the original report could not account for is the **`wordpress-sdk`
PHPUnit suite** — it is real, it just could not run inside the staging image (original finding M5).
With Composer available it passes in full.

## 3. Blockers — all five closed

| ID | Finding | Status |
|---|---|---|
| B1 | Admin portal had no authentication | **Closed** |
| B2 | Time-limited licenses failed offline HMAC verification | **Closed** |
| B3 | Refresh could mint the token it just revoked | **Closed** |
| B4 | `:orgId` path param silently ignored | **Closed** |
| B5 | 7-day grace period never activated on `validate` | **Closed** |

**B1** — `apps/admin/src/middleware.ts` now gates every path outside `/login`, `/auth/callback`,
`/logout`. Unauthenticated `GET /` returns **302 to the local OAuth login**, not the customer table.
`/api/proxy` independently requires both a session and a same-origin `Origin` header, and forwards
the *staff* access token rather than a baked-in `super_admin` credential. `adminAudit()` now writes
`c.get('user')?.id`, so actions are attributable (closes M6).

**B2** — verified across the real language boundary, which is the check that was missing. Node signed
a payload whose `expires_at` was a genuine `Date` (what `postgres.js` returns for `timestamptz`),
serialized it as it would go over the wire, and PHP verified it:

```
PHP verify (expires_at came from a real Date): PASS
PHP verify (tampered status):                  correctly rejected
```

`canonicalJson()` now has `if (value instanceof Date) return JSON.stringify(value.toISOString())`.
Golden-path step 3 covers the same contract and now passes.

**B3** — two activation tokens minted from identical claims in the same wall-clock second:

```
two tokens minted in the same second are different  <-- B3 fixed
jti(a)= c76125d534cb1954c6dc0a2b31e8f01d
jti(b)= c3a595bba6e42bd5ddb758ff05ec66ca
```

**B4** — `injectOrgContext` now reads the org id off the request path
(`/^\/api\/v1\/organizations\/([0-9a-f-]{36})(?:\/|$)/`) ahead of the header and token claim.
Covered by 12 tests in `middleware/tenant.test.ts`.

**B5** — `validate()` calls `ensureLifecycleFresh(license)` before building its response, as do both
`modules/updates/routes.ts` call sites. Golden-path step 9 now passes:
`1 day past expiry → grace_period`, `8 days past expiry → not valid`.

## 4. High priority

| ID | Finding | Status |
|---|---|---|
| H1 | JWKS endpoint returned 500 | **Closed** — `GET /.well-known/jwks.json` → 200 with a usable RS256 key; discovery's `jwks_uri` resolves |
| H2 | Public URLs derived from request Host | **Closed** — `PUBLIC_API_URL` / `PUBLIC_ACCOUNT_URL` are now env vars; discovery reports `issuer: http://localhost:8788`, and the login flow no longer escapes to the production domain |
| H3 | Rate limiter failed open under burst | **Closed** — see below |
| H4 | DB connection exhaustion under load | **Symptom gone**, shape unchanged — see below |
| H5 | RLS enabled but inert | **STILL OPEN** — see below |

**H3.** 130 concurrent unauthenticated requests to `/api/v1/me`, against the original run's
`{"200":101,"500":29}` with zero 429s:

```
 65 429
 65 401
```

The fix is a mutex-serialized in-isolate counter (`bumpAtomic`) plus Cloudflare's native
`RATE_LIMITER` binding when bound, replacing the non-atomic KV `get`→`+1`→`put`.

**H4.** The original 29 × HTTP 500 (`too many clients already`) did not reproduce. 60 concurrent
*authenticated* requests to `/api/v1/admin/stats` (which do touch Postgres via `setOrgRlsContext`)
returned **60 × 200**; at 130 concurrent the limiter shed load first — **92 × 429, 38 × 200, zero
500s** — against `max_connections = 100`.

Be precise about what that means: H4's symptom was largely downstream of H3. With the limiter
actually limiting, far fewer requests reach the database. The underlying shape is **unchanged and
intentional** — `createDb()` still builds one `postgres()` client per request with `max: 1`, now
documented in `db.ts` as a deliberate Workers/Hyperdrive choice. There is still no graceful 503 with
`Retry-After` if connections do run out. Reasonable as designed; not independently fixed.

**H5 — still open, and it is the most significant remaining gap.**

```
current_user = wpistic
 rolname     | rolsuper | rolbypassrls
 wpistic_app | f        | f             <- intended runtime role, created but unused
 wpistic     | t        | t             <- what the app actually connects as
 rls_enabled | rls_forced
          11 |          0
```

The `wpistic_app` role now exists, but `DATABASE_URL` still points at `wpistic` — a superuser with
`BYPASSRLS` — and no table has `FORCE ROW LEVEL SECURITY`. Postgres does not apply RLS to superusers
or table owners without it. So the tenant-isolation safety net remains switched off and has still
never been exercised. Tenant isolation currently rests entirely on the explicit `organization_id`
predicates in application queries (which B4's fix did tighten).

This is deliberately not fixed here: as the original report noted, flipping it will surface queries
that were silently relying on bypass, and that needs a full suite re-run behind it rather than a
drive-by change.

## 5. Medium priority

| ID | Status |
|---|---|
| M1 | **Partially closed.** `platform-sdk` now has tests (2). `apps/account` — the entire OAuth 2.1 / OIDC / MFA / session service — still has **zero test files and no `test` script**. So do `apps/dashboard`, `apps/admin`, `packages/auth-sdk`, `packages/types`, `packages/ui-design-system`. |
| M2 | **Closed.** `.github/workflows/wpistic-platform-ci.yml` now stands the staging stack up and runs `staging:smoke` plus golden-path and cross-language checks. This was the highest-value item on the original list. |
| M4 | **Still open.** Transactional email is still webhook-gated — `handlePasswordResetRequest` only delivers `if (c.env.EMAIL_WEBHOOK_URL)`, and no-ops silently otherwise. Password reset, invitations and owner notifications do not reach users unless a relay is configured. Launch blocker, not a code defect. |
| M5 | **Environmental.** The staging image still installs `php-cli` without Composer deps, so PHPUnit cannot run *in the image*. It passes 147/147 where Composer is available. |
| M6 | **Closed** — see B1. |

## 6. Verdict

The original report's five blockers and three of its five high-priority findings are genuinely
closed, and the closures hold up under live cross-boundary testing rather than only in unit tests.
The single most valuable change is M2: CI now runs the test that crosses the TypeScript↔PHP boundary,
which is the specific gap that let B2 ship twice.

Remaining before production, in order:

1. **H5** — point `DATABASE_URL` at `wpistic_app`, add `FORCE ROW LEVEL SECURITY`, re-run everything.
2. **M4** — wire a real transactional email provider; customers cannot currently reset passwords.
3. **M1** — `apps/account` has no tests at all, and it is the service holding OAuth, OIDC, MFA and sessions.
4. **H4** — graceful 503 + `Retry-After` instead of 500s if connections are ever exhausted.

## 7. Reproducing this

With Docker available, the supported path is unchanged and is the one CI uses:

```bash
npm run staging:env
npm run staging:up
npm run staging:smoke
```

Without a container registry, the same services run natively from the repo root of
`wpistic-platform` (Postgres 16, Node 20+, PHP 8 and Composer on PATH):

```bash
# .env.staging must be parsed verbatim — bash `source` breaks on PEM headers.
node -e '…parse .env.staging…' # see §1
bash docker/entrypoint.sh api                          # 8787
bash docker/entrypoint.sh account --inspector-port 9230 # 8788
bash docker/entrypoint.sh dashboard                    # 5173
bash docker/entrypoint.sh admin                        # 4321
node tests/e2e/staging-smoke.mjs
bash tests/e2e/golden-path.sh
```

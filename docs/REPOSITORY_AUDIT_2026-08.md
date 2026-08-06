# WPistic — Full Repository Audit

**Date:** 2026-08-06
**Commit audited:** `704c3a2` (`main`, PR #15 merged — working tree clean, nothing unmerged)
**Scope:** every tracked file in the repository (469 files, 8 top-level projects), not just docs.
**Method:** dependencies installed and every suite executed; migrations and seeds applied to a
fresh PostgreSQL 16 cluster; findings below are backed by command output, not code reading alone.

---

## 1. Bottom line

The repository is **green on every check it runs**, and the platform architecture is genuinely
sound. But four defects sit between this state and a working public launch, and none of them is
caught by CI — because each one lives in a gap *between* two components that no single suite
crosses.

The prior reports (`wpistic-platform/STAGING_QA_REPORT.md`, `docs/STAGING_REVERIFICATION.md`,
`docs/PR14_RELEASE_GATES.md`) are accurate about what they measured. This audit re-verified them
and found the remaining open items still open, plus new defects those reports did not cover.

---

## 2. What passes (all executed, 2026-08-06)

| Suite | Result |
|---|---|
| `wpistic-platform` typecheck (7 workspaces) | pass |
| `apps/api` vitest | **107/107** |
| `packages/platform-sdk` vitest | **2/2** |
| `apps/admin` `astro check` | 0 errors / 0 warnings / 0 hints |
| `wpistic-platform/wordpress-sdk` PHPUnit | **147/147**, 208 assertions |
| `wpistic-platform/wordpress-sdk` phpcs (WordPress standard) | 0 errors, 2 warnings |
| `wpistic-core` PHPUnit | **129/129**, 281 assertions |
| `licenseistic-memberistic-addon` PHPUnit | **19/19**, 72 assertions |
| `wpistic-dashboard` vitest | **38/38**; `vite build` clean |
| `wpistic-marketing` `check:static` | pass, 53 routes exported |
| 14 migrations on a fresh PostgreSQL 16 | applied clean |
| 3 seed files | applied clean |
| `schema.sql` regeneration | idempotent, **no drift** |
| `docker compose config` (dev + staging) | both valid |
| PHP lint across all 128 `.php` files | clean |

Also verified: **no secrets committed**, no `.env` tracked, zero `TODO`/`FIXME`/`HACK` markers,
and the committed `wpistic-dashboard/build/` output matches its source (the only difference on
rebuild is minifier variable-name drift from a newer Vite patch).

---

## 3. Priority 1 — blocks the public launch

### P1-1. The seeded catalog contradicts the documented launch posture

`docs/PR14_RELEASE_GATES.md` states: *"The canonical catalog contains 15 products. `ffl-checkout`
remains visible as `coming_soon` with `compliance_hold`."*

Applying migrations then seeds to a fresh database produces something else:

```
       slug        | catalog_state | acquisition_mode | compliance_hold | public_visibility
 ffl-checkout      | live          | paid             | f               | t
 tripistic         | live          | paid             | f               | t
 wpagentistic      | live          | paid             | f               | t
 ... (14 others: live / free_claim)
products visible in the public catalog: 17
```

**Root cause — ordering.** `migrate.js` applies all migrations *before* any seed. Migration
`20260803000014_catalog_free_launch.sql` ends with three data-fixup `UPDATE`s:

- `SET catalog_state='retired', public_visibility=FALSE WHERE slug IN ('tripistic','wpagentistic')`
- `SET catalog_state='coming_soon', compliance_hold=TRUE WHERE slug='ffl-checkout'`

On a fresh database none of those rows exist yet — `tripistic`/`wpagentistic` are created by seed
001 and `ffl-checkout` by seed 003, both of which run afterwards. All three updates match **zero
rows**. Seed 001 then re-inserts the two retired products with column defaults
(`live`/`paid`/`visible`).

Seed 003 has a second, independent instance of the same class of bug: its final `UPDATE products
… FROM plans pl WHERE pl.product_id = p.id AND pl.slug = 'free'` carries a
`WHEN 'ffl-checkout' THEN …` branch, but `ffl-checkout` is deliberately excluded from the `free`
plan insert above it, so the join drops the row and that branch is dead code.

**Impact.** The public product endpoint (`WHERE public_visibility = TRUE AND catalog_state <>
'draft'`) returns 17 products including a regulated-commerce entry that is supposed to be on
compliance hold, and two products the migration explicitly retired. No purchase is actually
possible (`acquisition_mode='paid'` fails the free-claim guard, and paid checkout is blocked by
`FREE_ONLY`), so this is a catalog-state and compliance-posture defect rather than a payment one —
but the shipped state is not the approved state.

**Fix.** Move the three fixups out of the migration and into the tail of seed 003 (after every
product exists), and give `ffl-checkout` its own `UPDATE` that does not join `plans`. Add an
assertion to the staging smoke test that the public catalog returns exactly 15 products and that
`ffl-checkout` is `coming_soon`/`compliance_hold`.

### P1-2. Rate limiting is per-isolate in production and never uses the binding it advertises

`apps/api/src/middleware/rate-limit.ts` is documented as *"KV-based fixed-window rate limiting"*.
It no longer touches KV at all. Enforcement is:

```ts
const localCounters = new Map<string, { count: number; expiresAt: number }>();
const native = c.env.RATE_LIMITER ? await c.env.RATE_LIMITER.limit({ key: subject }) : null;
const count = native ? … : await bumpAtomic(bucket, 60_000);
```

`RATE_LIMITER` is declared optional in `env.ts` and referenced here — **and is bound in neither
`wrangler.jsonc` environment** (production or staging). Only `RATE_LIMIT` (a KV namespace, now used
solely by the idempotency middleware) is bound. So in production `c.env.RATE_LIMITER` is
`undefined` on every request and the limiter falls back to `localCounters`, which is per-isolate.
Cloudflare runs many isolates across many colos, so the effective global limit is
`100 × isolate-count`, not 100/min/IP.

The `docs/STAGING_REVERIFICATION.md` measurement (`65 × 429`) is real but was taken against a
single `wrangler dev` process — one isolate — which is exactly the case where an in-memory counter
behaves like a global one. H3 is closed in staging and open in production.

Two secondary defects in the same file:

- `localCounters` is never pruned. Keys embed IP and minute, so every distinct client adds a Map
  entry that is never deleted for the life of the isolate — unbounded memory growth.
- `strictLimiter` rejects on `count >= limit` while the main limiter uses `count > limit`, so the
  documented "5 failed activations/hour" is actually 4.

**Fix.** Add the native rate-limit binding to both `wrangler.jsonc` environments (or a Durable
Object counter), make the fallback fail closed rather than silently degrade, evict expired
counters, and correct the file's doc comment.

### P1-3. The free launch has no plugin-activation path

Claiming a free product (`POST /organizations/:orgId/products/:slug/claim`) creates a
`product_access_grant` and returns `license: null`. Entitlements and the dashboard's owned-products
list both read access grants correctly, so the *dashboard* side works.

But the WordPress SDK's only entry credential is a license key —
`LicenseManager::activate()` takes a raw key, exchanges it for an RS256 activation token, and every
downstream capability (validate, refresh, `/products/:slug/updates`, `/downloads/authorize`,
offline HMAC verification) requires that token. Licenses are issued from exactly two call sites:

- `billing/service.ts:405` — Stripe subscription webhook, disabled under `FREE_ONLY`
- `admin/routes.ts:415` — staff-only manual grant, gated on fresh TOTP, one org at a time

So a customer who claims a free product on `app.wpistic.com` has **no way to activate the plugin on
their own site**. The advertised launch is a dashboard-only experience unless staff manually issue
a key per customer.

A related inconsistency: the staff grant route writes a `subscriptions` row with
`status='lifetime'` rather than a `product_access_grant`, so the two access mechanisms PR #14
introduced are not unified.

**Fix.** Issue a license inside the free-claim transaction for `type='plugin'` products (the
`issue()` service already defaults `max_activations` from the plan's `<slug>.sites.max`
entitlement, which seed 003 sets), and return the raw key once in the claim response.

### P1-4. Every marketing auth CTA points at a route that does not exist

`wpistic-marketing/lib/site.ts`:

```ts
dashboardUrl: "https://app.wpistic.com/dashboard",
loginUrl:     "https://app.wpistic.com/login",
registerUrl:  "https://app.wpistic.com/register",
```

These back the header "Log in" button, the `/login` and `/register` page CTAs, and the "Open
dashboard" buttons on `/developers` and `/downloads`.

`apps/dashboard/src/App.tsx` declares routes for `/`, `/products`, `/websites`, `/licenses`,
`/billing`, `/team`, `/security`, `/settings`, `/auth/callback`, `/auth/impersonate` and
`/invitations/accept` — and **no `/login`, `/register`, `/dashboard`, or catch-all**. Login and
registration are served by `account.wpistic.com` (`apps/account/src/index.ts`). Workers Assets will
serve `index.html` for those paths, React Router will match nothing, and the visitor gets a blank
page.

**Fix.** Point `loginUrl`/`registerUrl` at `https://account.wpistic.com/login|/register`,
`dashboardUrl` at `https://app.wpistic.com/`, and add a `<Route path="*">` fallback to the SPA.

---

## 4. Priority 2 — correctness, security depth, and operations

### P2-1. Row Level Security is not merely unenforced, it is unreachable

Confirmed live on a fresh database:

```
 rolname     | rolsuper | rolbypassrls
 wpistic     | t        | t            <- what DATABASE_URL points at
 wpistic_app | f        | f            <- intended runtime role, created, unused
 rls_enabled | rls_forced
          11 |          0
```

`docs/STAGING_REVERIFICATION.md` reports H5 as open for the role/`FORCE` reasons. It is worse than
that: `withOrg()` in `apps/api/src/db.ts` is the **only** code that executes
`set_config('app.current_org_id', …)`, and it has **zero call sites** anywhere in `apps/`. The
former `setOrgRlsContext` middleware is gone. So `app_current_org_id()` returns `NULL` on every
request, and the `org_isolation` policies evaluate `organization_id = NULL` → false for every row.

Flipping `DATABASE_URL` to `wpistic_app` and adding `FORCE ROW LEVEL SECURITY` today would not
tighten isolation — it would return zero rows for every tenant query. The safety net has to be
wired before it can be switched on. Tenant isolation currently rests entirely on the explicit
`organization_id` predicates in application queries (which are consistently present).

The header comment in `apps/api/src/middleware/tenant.test.ts` still claims the RLS safety net "is
actually set per request" — stale and misleading.

### P2-2. `apps/account` is the least-tested and least-hardened service

It holds OAuth 2.1, OIDC discovery, PKCE, MFA, sessions, and password reset, and has **no `test`
script and no test files** — unchanged since the previous report flagged it. In addition:

- **The login limiter has the exact non-atomic bug the API's was fixed for.**
  `auth/login.ts` does KV `get` → `parseInt` → `+1` → `put`. Under concurrent password guessing
  every request reads the same value before any write lands, so the 10/15min counter barely moves.
- **MFA recovery codes are a CPU amplification vector.** Every failed MFA attempt bcrypt-compares
  the submitted code against *all* unused recovery codes for the user. With the default code count
  that is many bcrypt rounds per request, on a platform with a hard CPU budget per invocation.
- **No rate limiting on `/password-reset/confirm`, `/register`, or `/token`.**
- `getPublicKey()` in the API caches the imported key in a module-level promise; a key rotation
  requires an isolate recycle to take effect.

### P2-3. Transactional email is still a silent no-op

`handlePasswordResetRequest` only delivers `if (c.env.EMAIL_WEBHOOK_URL)`, and otherwise returns
`{ ok: true, message: "If that email exists, a reset link has been sent." }` having sent nothing.
The token is written to the database either way. Invitations and owner notifications are gated the
same way. Customers cannot recover accounts. This was flagged as M4 in both prior reports and is
unchanged.

### P2-4. `license.expired` is a dead event, and expiry never reaches reporting

`license.expired` has a handler in `events/handlers.ts` that writes a customer notification —
and **zero emitters** anywhere in the codebase. Nothing schedules a scan for newly expired
licenses. Expiry is computed on read (`evaluateLicenseLifecycle`), which is correct for
*enforcement*, but `licenses.status` stays `'active'` in the database forever. Consequences:

- No customer is ever notified that a license expired.
- `GET /admin/stats` counts `licenses WHERE status='active'` — expired licenses inflate it.
- The admin `/licenses?status=expired` filter can never match a row.

**Fix.** Add a scheduled reconciler (the outbox cron already runs every minute) that transitions
past-grace licenses to `expired` and emits the event.

### P2-5. Two divergent copies of the WordPress SDK share one package name

| | `wordpress-sdk/` (repo root) | `wpistic-platform/wordpress-sdk/` |
|---|---|---|
| Composer name | `wpistic/wordpress-sdk` | `wpistic/wordpress-sdk` — **identical** |
| License | MIT | GPL-2.0-or-later |
| Namespace | `Wpistic\` | `WPistic\Sdk\` |
| Entry point | `LicenseManager` (static, URL-constructed) | `WpisticClient` (`boot()`) |
| Files | 5 source | 14 source (Api, Admin, Update, Entitlement layers) |
| `phpunit.xml.dist` | **absent** | present |
| CI coverage | **none** | `php-sdk` job (lint + phpcs + PHPUnit) |
| Tests | 25 run, 7 incomplete | 147 pass, 208 assertions |

The root copy is a superseded earlier draft. It is still referenced by a recent commit
(`93ffc6b`, "Pin root wordpress-sdk composer platform to PHP 7.4 and commit its lock"), so it is
being maintained by accident.

Its `INTEGRATION_GUIDE.md` is worse than stale — it documents `WPistic\Sdk\Licensing::instance()`
and `\WPistic\Sdk\Admin::renderPage`, neither of which exists in *either* copy. Any plugin author
following it writes code that cannot run.

**Fix.** Delete `wordpress-sdk/` at the repo root; fold anything worth keeping from
`INTEGRATION_GUIDE.md` into `wpistic-platform/wordpress-sdk/README.md`.

### P2-6. Deployment configuration is entirely placeholders

`apps/api/wrangler.jsonc` (and the other three) carry `YOUR_HYPERDRIVE_ID`, `YOUR_KV_ID`,
`YOUR_KV_ID_2`, `STAGING_HYPERDRIVE_ID`, `STAGING_RATE_LIMIT_KV_ID`, `STAGING_SESSION_CACHE_KV_ID`.
`ADMIN_EMAILS` is `""` in both environments, which means `requireAdmin` denies every staff JWT —
a safe default, but the admin portal is inaccessible until it is set. This matches release gate #2
in `PR14_RELEASE_GATES.md` and remains an operator task, not a code task.

---

## 5. Priority 3 — documentation, content, and coverage

### P3-1. The root documentation describes a superseded architecture

- `README.md` and `docs/ARCHITECTURE.md` open with *"WordPress is the SaaS engine"* and describe
  only the WordPress plugin stack. Neither mentions `wpistic-platform` in its architecture
  narrative, while `wpistic-platform/README.md` calls that platform *"the commercial and
  operational backbone of the WordPressistic ecosystem."* A reader cannot tell which is current.
- `docs/AUDIT.md` (dated 2026-06-11) is presented as *"the source of truth for the audit"* and is
  now superseded — of its 15 gaps, #9 (module prop) is fixed, #2 (pagination) and #13 (error
  boundary) are still open in `wpistic-dashboard`, and the rest were overtaken by the platform
  rewrite.
- `wpistic-auth-flow/` and the root `wordpress-sdk/` appear in **no** README, ARCHITECTURE, or
  SETUP document, and have no CI. `wpistic-auth-flow` is additionally described in the README's
  install steps as an external plugin to obtain elsewhere, while living in this repository.
- `wpistic-marketing/README.md` is the unmodified `create-next-app` boilerplate.

### P3-2. Public marketing content is not launch-safe as written

- **`/customers` publishes fabricated case studies as fact.** Three full stories and eight named
  testimonials — "Priya Nair, Founder, Northloop Digital"; "Marcus Webb, Co-founder, Fieldstack
  Plugins"; "Elena Voss, Head of Ops, Rowhouse Agency" — under the page description *"real results
  from real customer stories."* For a product with no customers yet, publishing these as genuine
  endorsements is a legal exposure (FTC endorsement guidelines), not just a copy issue.
- **`/status` hardcodes "All systems operational"** in a static export with no health check behind
  it. It will keep saying that during an outage.
- **Pricing contradicts the launch mode.** `lib/products.ts` advertises `startingPrice: 19` and up
  across the catalog, while the platform runs `BILLING_MODE=FREE_ONLY` with checkout disabled. All
  pricing tiers route to `/contact`, so nothing breaks — but the public price list describes a
  commercial model that does not exist yet.
- **The contact form is a `mailto:` handoff.** `ContactForm.tsx` builds a `mailto:` URL and sets
  `window.location.href`. On a device with no mail client configured the submission is silently
  lost; there is no delivery record, no spam protection, and no confirmation.
- `public/.htaccess` sets no security headers (no CSP, `X-Frame-Options`, or HSTS) for the
  Hostinger static host.

### P3-3. Test and CI coverage gaps

No test suite exists for `apps/account`, `apps/dashboard`, `apps/admin`, `packages/auth-sdk`,
`packages/types`, or `packages/ui-design-system`. No CI workflow covers `wpistic-auth-flow`,
`wpistic-theme`, or the root `wordpress-sdk`. CI is otherwise strong: the platform workflow now
stands up the full Docker staging stack and runs `staging:smoke` plus the golden path and the
cross-language HMAC check — the single highest-value change from the previous report, and it holds.

### P3-4. Smaller items

- `apps/api/src/modules/admin/routes.ts` — `GET /organizations/:orgId` does not validate the path
  parameter, so a non-UUID yields a PostgreSQL cast error surfacing as HTTP 500 rather than 400.
- `licenses/service.ts` `activate()` writes `token_hash` in a separate statement *after* the
  transaction commits; a failure there leaves an activation row whose token cannot be resolved.
- `catalog/routes.ts` writes its outbox row with raw SQL instead of the typed `writeOutboxEvent()`
  helper. The shape happens to match today; nothing enforces that it stays matching.
- Grace period starts at **first observation past expiry**, not at expiry. A license unchecked for
  a year still receives a full fresh 7-day grace on its next check. This is deliberate and
  documented in the code and in `golden-path.sh`, but it is not what "7-day grace period" implies
  to a reader of the marketing copy.
- `wpistic-auth-flow` source uses inconsistent mixed tab/space indentation, unlike every other PHP
  package in the repository.
- `wpistic-dashboard` still has no React error boundary (`docs/AUDIT.md` gap #13) and no pagination
  on `wpistic-core` list endpoints (gap #2).

---

## 6. Recommended sequence

**Before any public launch**

1. P1-1 catalog seed ordering — plus a smoke assertion pinning the 15-product catalog
2. P1-3 issue a license inside the free claim — without it the free launch does not function
3. P1-4 marketing auth URLs + SPA catch-all route
4. P1-2 bind the native rate limiter and fail closed
5. P2-3 wire a real transactional email provider
6. P3-2 replace or clearly label the fabricated customer content; make `/status` honest

**Immediately after**

7. P2-4 license expiry reconciler + event emission
8. P2-2 tests for `apps/account`, atomic login limiter, cap the recovery-code bcrypt loop
9. P2-5 delete the duplicate root `wordpress-sdk/`
10. P2-1 wire `withOrg()` into tenant-scoped reads, *then* switch to `wpistic_app` and
    `FORCE ROW LEVEL SECURITY`, then re-run the full suite
11. P3-1 reconcile the root docs with the platform-first architecture; retire `docs/AUDIT.md`

**Operator gates (unchanged from `PR14_RELEASE_GATES.md`)**

Real Cloudflare resource IDs, `ADMIN_EMAILS`, DNS/TLS, OAuth redirect allowlists, database
backup/restore evidence, and recorded owner approval.

---

*Every measurement in this document was produced by executing the relevant command against
`704c3a2` on 2026-08-06. Where a finding contradicts an earlier report, the earlier report is not
wrong about what it measured — the difference is what was measured.*

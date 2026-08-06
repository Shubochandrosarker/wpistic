# Super-Admin Management — Operations & Deployment Guide

Audience: whoever operates `admin.wpistic.com`, and any agent or engineer
deploying it. This covers what the management surfaces do, how staff access is
configured, and exactly what has to be true before it works in production.

---

## 1. What this adds

The admin portal was read-only apart from four license actions. It now manages
the whole commercial model:

| Area | What you can do | Where |
|---|---|---|
| **Catalog** | Create products, edit them, retire or delete them | `/catalog` |
| **Plans** | Add plans per product, rename, reorder, archive | `/catalog/<product>` |
| **Prices** | Add prices per plan, set the default, archive | `/catalog/<product>` |
| **Features** | Define the entitlement keys a product's code checks | `/catalog/<product>` |
| **Entitlements** | Set each plan × feature value in one grid | `/catalog/<product>` |
| **Organizations** | Rename, re-slug, change billing email, suspend, reactivate | `/organizations/<id>` |
| **Product access** | Grant a product, **upgrade/downgrade its plan**, revoke | `/organizations/<id>` |
| **Members** | Add by email, change role, remove | `/organizations/<id>` |
| **Licenses** | Issue by hand, **change plan**, change seats, extend expiry, transfer | `/licenses/<id>` |
| **Users** | Search, suspend, clear MFA, revoke sessions, issue reset links | `/users` |

Plus one customer-facing change: **claiming a free plugin product now issues a
real license key**. Previously a claim recorded entitlement but produced no key,
so the customer could see the product in their dashboard and never activate it
in WordPress. The key is now minted in the same transaction as the grant and
shown once, in a modal the customer must dismiss.

---

## 2. The two things to understand before operating this

### 2.1 Entitlements are the product, plans are the container

Nothing in the platform checks plan *names*. Product code asks
`entitlements->allows('seoistic.pro.enabled')` or
`getMax('seoistic.sites.max')`. Those keys come from `features`, and their
values come from `plan_entitlements` — the grid on the product page.

So an "upgrade" is never a billing event. It is one of:

- **Free / granted access** → change the grant's plan on the organization page.
- **Licensed access** → change the license's plan on the license page.

Either one re-points entitlement resolution at the new plan's entitlement set.
The customer's plugin picks it up on its next validation (within 12 hours, or
immediately if they hit "check now"). Cached resolutions are dropped
automatically on every change, so there is no 60-second lag.

**The one convention that matters:** name the seat-limit feature
`<product-slug>.sites.max`. Licence issuance reads that key to decide the
default activation limit, and the plan-change flow reads it to decide the new
seat count. Creating a `free_claim` product scaffolds it for you.

### 2.2 Two MFA modes, deliberately different

| Mode | When | Behaviour |
|---|---|---|
| **Step-up window** | Routine edits — save a plan, add a price, change a role, grant access, change a license plan | One authenticator code opens a **15-minute** window. Everything in that window proceeds without further prompts. |
| **Per-action code** | Irreversible or high-blast-radius — revoke, delete, retire, suspend an org or user, clear MFA, transfer a license, impersonate | Always prompts for a code **for that specific action**, even inside an open window. |

The header shows the window state with a live countdown and a "Lock now"
button. If a window lapses mid-edit, the next save prompts once and replays
automatically — the form is not lost.

Every mutation writes to `audit_logs` with the acting staff user, a before/after
diff, IP, user agent, and correlation id. Destructive actions additionally
require a written reason, which is stored on the audit row.

---

## 3. Staff access configuration

Two environment variables on the **api** Worker control everything.

### `ADMIN_EMAILS` — who is staff at all

Comma-separated. A staff JWT is accepted only if its email is on this list
**and** its token carries the `admin` scope (granted by the `wpistic_admin`
OAuth client). Empty means nobody can reach `/api/v1/admin` — which is the safe
default, and also why a fresh deploy has an inaccessible admin portal until you
set this.

```
ADMIN_EMAILS=you@wpistic.com,ops@wpistic.com
```

### `ADMIN_ROLES` — what each staff member may do

`email=role` pairs, comma-separated. Anyone allowlisted but unlisted here
defaults to `support_agent`, the least privileged tier.

```
ADMIN_ROLES=you@wpistic.com=super_admin,ops@wpistic.com=billing_admin
```

| Role | Can do |
|---|---|
| `support_agent` | Read everything; suspend/reactivate/reset licenses; impersonate |
| `billing_admin` | + issue licenses, change plans, seats, expiry, transfer |
| `platform_admin` | + catalog, organizations, grants, members, users |
| `super_admin` | Everything |

Roles are resolved **server-side from this variable only**. The old
`X-Admin-Role` request header is not trusted and never was authoritative.

The `ADMIN_API_TOKEN` automation credential is explicitly barred from every
management surface — those actions must be attributable to a person.

### Staff MFA is mandatory in practice

Every management mutation needs either a step-up window or a per-action code,
and both require the staff account to have TOTP enrolled. A staff member without
MFA can read the portal and change nothing.

**Enrol before you need it**: sign in to `account.wpistic.com` as the staff user
and complete MFA setup. There is no bypass, including for the owner account.

---

## 4. Deployment

### 4.1 Prerequisites

Nothing new is required beyond the existing production gates. There are **no new
migrations** — the management surfaces use tables that already exist
(`products`, `plans`, `prices`, `features`, `plan_entitlements`,
`product_access_grants`, `organization_memberships`, `users`, `licenses`).

Step-up windows are stored in the existing `SESSION_CACHE` KV namespace under
`stepup:<user-id>` with a 15-minute TTL. No new binding.

### 4.2 Order of operations

```bash
cd wpistic-platform
npm ci

# 1. Verify locally before touching production.
npm run typecheck --workspaces --if-present
npm --workspace @wpistic/api run test -- --run          # expect 125 passing
npm --workspace @wpistic/platform-sdk run test          # expect 2 passing

# 2. Database: no new migrations, but confirm the catalog seed is correct.
#    A fresh database must end with 15 publicly visible products.
DATABASE_URL=<url> npm --workspace @wpistic/database run migrate
DATABASE_URL=<url> npm --workspace @wpistic/database run seed
psql "<url>" -c "SELECT count(*) FROM products WHERE public_visibility AND catalog_state <> 'draft';"
# → 15

# 3. Set staff configuration on the API Worker BEFORE deploying it.
npx wrangler deploy --dry-run   # sanity
# Set ADMIN_EMAILS / ADMIN_ROLES in apps/api/wrangler.jsonc vars, or via
# `wrangler secret put` if you prefer them out of source control.

# 4. Deploy, API first — the portal calls it on every page load.
npm run deploy:api
npm run deploy:admin
npm run deploy:dashboard        # carries the customer-facing key reveal
```

### 4.3 Existing databases: one manual correction

A database seeded **before this change** may have the wrong catalog state,
because migration `20260803000014` ran before the products it corrects existed.
Check and fix:

```sql
-- Expect: ffl-checkout = coming_soon / compliance_hold / no free plan
--         tripistic, wpagentistic = retired / not publicly visible
SELECT slug, catalog_state, acquisition_mode, compliance_hold, public_visibility
FROM products WHERE slug IN ('ffl-checkout', 'tripistic', 'wpagentistic');
```

If they are wrong, re-running `npm run db:seed` fixes them — the seed is
idempotent and now carries the corrections authoritatively.

### 4.4 Post-deploy smoke test

Do these in order, as a `super_admin` staff account with MFA enrolled:

1. Load `/catalog`. The header badge reads **"🔒 Changes locked"**.
2. Click it, enter your authenticator code. It flips to **"🔓 Unlocked 14:5x"**.
3. Create a throwaway product: slug `smoketest`, type `plugin`, acquisition
   `free_claim`, state `draft`. It should appear with 1 plan and 1 feature.
4. Open it. Confirm the `free` plan exists with `smoketest.sites.max` = 1.
5. Add a `pro` plan; set `smoketest.sites.max` to 5 on it; save entitlements.
6. Delete the product (it has no customers, so hard delete is allowed). It will
   ask for a reason and a fresh code even though your window is open — that is
   the per-action gate working.
7. Open any real organization → confirm grants and members render.
8. Open any real license → change its plan to another plan of the same product
   and back. Check `/audit` shows both changes with your email as the actor.

If step 2 fails with "Staff MFA must be enabled", enrol MFA on the account
first. If step 1 shows a permission error, `ADMIN_EMAILS` or `ADMIN_ROLES` is
not set on the deployed API Worker.

---

## 5. Common tasks

### Add a new product with a free tier and a paid tier

1. `/catalog` → **New product**. Slug, name, type `plugin`, acquisition
   `free_claim`, free sites `1`. Leave state `draft`.
2. Open the product. Add a `pro` plan.
3. Add features you want to gate on — e.g. `pro.enabled` (boolean),
   `sites.max` (number). The slug prefix is added automatically.
4. Fill the entitlement grid: `free` gets `sites.max = 1`; `pro` gets
   `sites.max = 5` and `pro.enabled = true`. Save each plan's grid.
5. Add a price to `pro` (amount in whole currency units; stored as cents).
6. Set state to `live` and tick **Public catalog visibility**.

Customers can now claim the free tier and receive a working license key.

> Paid checkout stays disabled while `BILLING_MODE=FREE_ONLY`. A price is
> recorded but nothing can be bought until billing is switched on with real
> Stripe credentials.

### Upgrade a customer from free to pro

- **They hold a grant** (claimed free): `/organizations/<id>` → Product access →
  change the plan dropdown on that row. Done.
- **They hold a license**: `/licenses/<id>` → Plan → select `pro` → Change plan.
  Seats follow the new plan's `sites.max` automatically.

### Downgrade a customer who has more sites than the new plan allows

The change is refused by default, with a message naming the numbers. Tick
**"Free the newest sites if the new plan allows fewer"** and retry — the most
recently activated sites are deactivated until the license fits. Their domains
are listed in the response and recorded in the audit log.

### Give someone a license without them paying

`/organizations/<id>` → **Issue a license** → pick product, plan, optionally
override seats. The key is displayed once; copy it before dismissing.

### A customer is locked out of MFA

`/users` → find them → **Clear MFA**. Verify their identity through a channel
you trust first — this hands over account access. Their next sign-in needs no
code until they re-enrol.

### A customer cannot reset their password

Transactional email is still gated behind `EMAIL_WEBHOOK_URL`, so the platform
sends nothing. `/users` → **Reset link** generates a single-use link valid for
one hour and shows it to you. Deliver it through a verified channel. Fixing this
properly means wiring a real email provider — see the open items below.

---

## 6. What this change does *not* fix

These were identified in `docs/REPOSITORY_AUDIT_2026-08.md` and remain open:

| | Impact on the admin panel |
|---|---|
| **Transactional email is a no-op** | Password resets and invitations must be delivered by hand. The `/users` reset-link flow is a workaround, not a fix. |
| **Rate limiter is per-isolate** | `RATE_LIMITER` is bound in no wrangler environment, so production limiting is weaker than intended. Unrelated to admin auth, which is JWT + allowlist + MFA. |
| **RLS is inert** | Tenant isolation rests on explicit `organization_id` predicates, which every query here carries. Turning RLS on would currently break all queries — do not flip it without wiring `withOrg()` first. |
| **Marketing auth CTAs are dead links** | `www.wpistic.com` login/register buttons point at SPA routes that do not exist. Customers cannot reach the dashboard from the public site. |

The last one is worth fixing before promoting the free-claim flow, since a
customer who cannot sign in cannot claim anything.

---

## 7. API reference

All routes are under `https://api.wpistic.com/api/v1/admin`. Auth: staff JWT
with `admin` scope. `SU` = requires an open step-up window; `MFA` = requires
`mfa_code` in the body for that call.

### Catalog — `platform_admin`+

```
GET    /catalog/products
GET    /catalog/products/:productId
POST   /catalog/products                          SU
PATCH  /catalog/products/:productId               SU
POST   /catalog/products/:productId/retire        MFA + reason
DELETE /catalog/products/:productId               MFA + reason  (refused if in use)
POST   /catalog/products/:productId/plans         SU
PATCH  /catalog/plans/:planId                     SU
DELETE /catalog/plans/:planId                     MFA + reason  (refused if in use)
POST   /catalog/plans/:planId/prices              SU
PATCH  /catalog/prices/:priceId                   SU
DELETE /catalog/prices/:priceId                   SU            (refused if in use)
POST   /catalog/products/:productId/features      SU
PATCH  /catalog/features/:featureId               SU
DELETE /catalog/features/:featureId               SU
PUT    /catalog/plans/:planId/entitlements        SU            (whole-set replace)
```

### Tenancy — `platform_admin`+

```
POST   /tenancy/organizations                              SU
PATCH  /tenancy/organizations/:orgId                       SU
POST   /tenancy/organizations/:orgId/status                MFA + reason
GET    /tenancy/organizations/:orgId/grants
POST   /tenancy/organizations/:orgId/grants                SU  + reason
PATCH  /tenancy/organizations/:orgId/grants/:grantId       SU  + reason   ← upgrade/downgrade
DELETE /tenancy/organizations/:orgId/grants/:grantId       MFA + reason
POST   /tenancy/organizations/:orgId/members               SU  + reason
PATCH  /tenancy/organizations/:orgId/members/:membershipId SU  + reason
DELETE /tenancy/organizations/:orgId/members/:membershipId MFA + reason
GET    /tenancy/users
GET    /tenancy/users/:userId
PATCH  /tenancy/users/:userId                              SU  + reason
POST   /tenancy/users/:userId/status                       MFA + reason
POST   /tenancy/users/:userId/reset-mfa                    MFA + reason
POST   /tenancy/users/:userId/password-reset               SU  + reason
POST   /tenancy/users/:userId/revoke-sessions              SU  + reason
```

### Licensing — `billing_admin`+

```
POST   /licensing                          SU  + reason   ← issue, returns raw key once
POST   /licensing/:licenseId/change-plan   SU  + reason   ← upgrade/downgrade
POST   /licensing/:licenseId/seats         SU  + reason
POST   /licensing/:licenseId/extend        SU  + reason
POST   /licensing/:licenseId/transfer      MFA + reason
```

`change-plan` and `seats` accept `over_limit`: `"refuse"` (default) or
`"deactivate_newest"`.

### Step-up

```
GET    /step-up      → { active, expires_at }
POST   /step-up      { mfa_code } → opens a 15-minute window
DELETE /step-up      → closes it
```

### Browser access

The portal never holds an API credential. Islands post to the same-origin
`/api/proxy`, which requires an admin session **and** a same-origin `Origin`
header, then forwards with the staff token. The proxy carries a positive
allowlist of path patterns per HTTP method — **adding a route to the API is not
enough to make it reachable from a browser; it must be added to
`apps/admin/src/pages/api/proxy.ts` too.**

---

## 8. Verification record

Executed against this branch:

| Check | Result |
|---|---|
| `typecheck` across 7 workspaces | pass (admin: 0 errors, 0 warnings, 0 hints) |
| `apps/api` vitest | **125 passing** (was 107; +15 guard tests, +3 issuance tests) |
| `packages/platform-sdk` vitest | 2 passing |
| dashboard / admin / api builds | all pass |
| 14 migrations + 3 seeds on a fresh PostgreSQL 16 | clean, seeds idempotent on re-run |
| `schema.sql` regeneration | no drift |
| Public catalog after seeding | **15 products**, `ffl-checkout` = `coming_soon` + `compliance_hold` |
| `docker compose config` (staging graph) | valid |

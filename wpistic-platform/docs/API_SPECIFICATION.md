# WPistic Control Plane API Specification

Canonical, current-as-of-Phase-4 reference for every route mounted in
`apps/api/src/index.ts`. This document describes what the code actually does,
not an aspirational design — when the two diverge, fix the code or fix this
file in the same change.

## Base URL

```
https://api.wpistic.com/api/v1
```

## Authentication

### Bearer Token (JWT)

Most dashboard-facing routes require an RS256-signed access token minted by
`account.wpistic.com` (re-signed on org switch by `POST /auth/switch-org`):

```
Authorization: Bearer <JWT>
```

Claims: `sub` (user id), `email`, `org_id` (optional), `org_role`, `scope`,
`aud`, `iss`, `exp`, `iat`, and on impersonation sessions `imp`/`imp_admin`.

### API Keys

`Authorization: Bearer wpk_<hex>` — bound to exactly one organization at
issuance (`POST /organizations/:orgId/api-keys`); cannot act on any other org.

### License / Activation Credentials (plugin-facing, public routes)

The WordPress SDK never sends a bearer token. Instead:
- **License key** (`{product}_<32 hex>`) — only at `/licenses/activate`, and
  once more alongside the activation token at `/downloads/authorize` as a
  defense-in-depth double-check. Never stored raw; only its SHA-256 hash.
- **Activation token** — an RS256 JWT returned by activate/refresh. Sent back
  verbatim on validate/refresh/deactivate/connect/updates/downloads. The
  plugin never decodes or verifies it itself; the API does, every time.

### Organization Context

For org-scoped routes: a `:orgId` route param, or `X-Organization-Id` header,
or the JWT's own `org_id` claim. Whichever is present, membership is always
re-checked server-side (`middleware/tenant.ts`) — a client-supplied org id is
never trusted on its own.

### Admin

`X-Admin-API-Token: <ADMIN_API_TOKEN>` (service-to-service from
admin.wpistic.com), or a staff JWT whose `email` is in the `ADMIN_EMAILS`
allowlist. Impersonation (`POST /admin/impersonate`) additionally requires a
fresh MFA code and mints a 30-minute token that blocks billing/destructive
actions at the route level.

---

## Licenses

### `POST /licenses/activate` — public, license-key authenticated

Rate limit: 5 failed attempts / hour / IP (`strictLimiter`). Supports
`X-Idempotency-Key`.

```jsonc
// Request
{
  "key": "seoistic_3f9a2b7c1d8e4f60a1b2c3d4e5f60718",
  "domain": "https://example.com",
  "installation_uuid": "install-uuid",       // stable per-site, shared across WPistic plugins
  "site_url": "https://example.com",         // optional
  "home_url": "https://example.com",         // optional
  "environment": "production",               // default; server re-detects from domain
  "product_version": "2.1.0",                // optional
  "wp_version": "6.6",                       // optional
  "php_version": "8.2"                       // optional
}
```

```jsonc
// Response 200 — LicenseActivationResponse
{
  "valid": true,
  "status": "active",                        // active | suspended | expired | revoked | cancelled | grace_period | activation_suspended
  "grace_period_ends_at": null,
  "product": "seoistic",
  "plan": "professional",
  "expires_at": "2027-07-25T00:00:00.000Z",
  "activation": { "id": "uuid", "domain": "example.com", "environment": "production" },
  "entitlements": { "seoistic.pro.enabled": true, "seoistic.sites.max": 5 },
  "updates": { "channel": "stable", "allowed": true },
  "check_after": 43200,
  "grace_period_days": 7,
  "signature": "<hex hmac>",
  "activation_token": "<RS256 JWT>",
  "verification_key": "<hex, HMAC(master, license_key_hash)>"
}
```

Errors: `400 invalid_key`, `400 invalid_domain`, `403` (installation
suspended, or license not usable — revoked/suspended/cancelled/expired past
grace), `409 activation_limit_reached`, `429 rate_limited`.

### `POST /licenses/validate` — public, activation-token authenticated

Body **requires** the site's current domain/environment/installation_uuid —
the server hard-rejects (`403`) if any no longer match the activation record.
This is the server-side security check the plugin cannot bypass by replaying
an old token against a different site.

```jsonc
{
  "activation_token": "<JWT>",
  "domain": "example.com",
  "environment": "production",
  "installation_uuid": "install-uuid",
  "plugin_version": "2.1.0"          // optional
}
```

Response: same shape as activation minus `activation_token`/`verification_key`.
Grace period is server-side truth: once a license's `expires_at` first passes
with no `grace_period_ends_at` set, the API pins it to exactly `NOW() + 7
days` and every subsequent validate reads that same fixed deadline.

Errors: `401` (bad signature, expired, or the token is on the revocation
blocklist), `403` (domain/environment/installation_uuid mismatch, or the
token has been superseded by a refresh/rotation — i.e. it's no longer the
current token on file for this activation), `404` (license/activation
deleted server-side).

### `POST /licenses/refresh` — public, activation-token authenticated

```jsonc
{ "activation_token": "<JWT>" }
```

Verifies the old token, immediately revokes it (added to the KV blocklist —
`revoked_token:{sha256(token)}`), issues a fresh RS256 token + `verification_key`,
and returns the same `LicenseActivationResponse` shape as activation. Fails
`403` if the underlying license is not currently usable (revoked/suspended/
cancelled/expired past grace) or the activation itself is inactive/suspended.

### `POST /licenses/deactivate` — public, activation-token authenticated

```jsonc
{ "activation_token": "<JWT>", "installation_uuid": "install-uuid" }
```
`{ "deactivated": true }` — sets the activation `inactive`, blocklists its
token for the remainder of its natural TTL.

### `GET /organizations/:orgId/licenses` — dashboard

`{ "licenses": [LicenseView, ...] }`, each with `active_activations` computed
inline.

### `GET /organizations/:orgId/licenses/:licenseId` — dashboard

`{ "license": LicenseView, "activations": [ActivationView, ...] }`.

### `POST /organizations/:orgId/licenses/:licenseId/rotate` — dashboard (admin/product_manager)

Issues a brand-new key (returned **once**, `{ license, activations, key, key_mask }`)
and immediately revokes every currently-active activation on that license
(each token blocklisted) — plugins must reactivate with the new key.

### `DELETE /organizations/:orgId/licenses/:licenseId/activations/:activationId` — dashboard (admin/product_manager)

`204`. Deactivates one site's activation from the dashboard.

---

## Websites

Cross-product registry: one row per organization + normalized domain.

### `GET /organizations/:orgId/websites` — dashboard

`{ "websites": [WebsiteView, ...] }` with each site's per-product installations.

### `POST /organizations/:orgId/websites` — dashboard (admin/product_manager)

```jsonc
{ "domain": "example.com", "name": "Production", "environment": "production" }
```
`201 { "website": {...}, "connection_token": "wpconn_<32 hex>" }` — shown once.

### `DELETE /organizations/:orgId/websites/:websiteId` — dashboard (admin/product_manager)

`204`. Revokes the connection token, sets `health_status: 'offline'`, **and
cascades**: deactivates every currently-active license activation tied to
that website (each token blocklisted too).

### `POST /websites/connect` — public, activation-token authenticated

```jsonc
{
  "activation_token": "<JWT>",
  "domain": "example.com",
  "product": "seoistic",
  "environment": "production",
  "product_version": "2.1.0", "wp_version": "6.6", "php_version": "8.2"  // optional
}
```
Verifies the activation token belongs to the same org/product **and** that
`domain`/`environment` match the activation's own record exactly (you cannot
register a website using a token issued for a different site). Enforces
`< license.max_websites` currently-connected sites for that organization
(the domain being (re)connected doesn't count against its own limit).
`201 { "website_id": "uuid", "connection_token": "wpconn_<32 hex>" }`.
`409 max_websites_reached` when the limit is hit.

### `POST /websites/heartbeat` — public, connection-token authenticated

**Token goes in a header, not the body** — `X-Website-Token: wpconn_...`.
Fails closed (`401`) on a missing or unrecognized token.

```jsonc
{
  "wp_version": "6.6", "php_version": "8.2",           // optional
  "health": "healthy",                                  // optional
  "products": [{ "slug": "seoistic", "version": "2.1.0" }]  // optional
}
```
`{ "ok": true, "website_id": "uuid", "next_heartbeat_after": 3600 }`.

---

## Updates & Downloads

The **only** canonical implementation — `modules/updates/**`. `product_releases`
(the old catalog-module table) is retired; nothing writes to it anymore.

### `GET /products/:slug/updates` — public, activation-token authenticated

Query string (all required except `php_version`/`wp_version`):
`?activation_token=<JWT>&installation_uuid=...&version=<current>&channel=stable&php_version=8.2&wp_version=6.6`

Requires a valid, matching activation token (`403` if the product or
installation doesn't match). Requires the license to be currently usable —
grace period counts as usable here too. Compares versions semantically (not
lexically — `2.10.0 > 2.9.0`). A candidate must be `published` on a matching
channel, **or** be `is_security_release` (security releases cross channels).
Unless `is_forced`, eligibility is also gated by a deterministic rollout
bucket: `sha256(installation_uuid:version) mod 100 < rollout_percentage` — the
same installation always lands in the same bucket for a given version.

```jsonc
// available
{
  "available": true, "version": "2.2.0", "release_notes": "...",
  "package_size": 2048000, "checksum": "<sha256 hex>",
  "requires": { "php": "7.4", "wp": "6.0", "plan": "professional" },
  "download_url": null, "authorize_url": "/api/v1/downloads/authorize"
}
// not available
{ "available": false, "version": null, "release_notes": null, "package_size": null,
  "checksum": null, "requires": null, "download_url": null,
  "authorize_url": "/api/v1/downloads/authorize" }
```

`download_url` is always `null` here — the caller must authorize a download
separately.

### `POST /downloads/authorize` — public, dual-credential authenticated

```jsonc
{
  "license_key": "seoistic_3f9a...",     // re-verified against the activation's own license
  "activation_token": "<JWT>",
  "product_slug": "seoistic",
  "requested_version": "2.2.0"
}
```
Checks: activation token resolves and matches `product_slug`; `license_key`'s
hash matches that same license (defense in depth — both credentials must
agree); license usable (grace counts); requested version is `published` for
that product; if the package requires a specific plan, the license's plan
must match it (`403` otherwise). Issues a `crypto.randomUUID()` opaque token,
stored in KV as `download_auth:{token}` with a 15-minute TTL.

```jsonc
{ "download_url": "/api/v1/downloads/file?token=<uuid>", "expires_in": 900 }
```

### `GET /downloads/file?token=<uuid>` — public, single-use token

Reads the KV grant and **deletes it immediately** (before streaming) — Workers
KV has no atomic compare-and-swap, so read-then-delete is the tightest
available race window against a concurrent replay; a token already consumed,
or presented a second time, gets `403`. Streams the object straight from R2
with `Content-Type: application/zip` and a `Content-Disposition: attachment`
header naming the package file.

### Admin package management — `/admin/packages` (admin auth required)

- `POST /admin/packages` — `{ product_slug, channel, version, release_notes?, package_base64, checksum?, min_php_version?, min_wp_version?, required_plan_id?, rollout_percentage?, is_security_release?, is_forced? }`. Decodes the base64 payload, computes its SHA-256 over the raw bytes (never through a lossy string round-trip), verifies it against `checksum` if supplied, uploads to R2 at `{product_slug}/{version}.zip`, and creates a `draft` `update_packages` row. `201 { "package": {...} }`.
- `POST /admin/packages/:id/publish` — flips to `published`, sets `published_at`, publishes a `product.update.published` event.
- `POST /admin/packages/:id/rollback` — flips to `rolled_back`.

---

## Entitlements

### `GET /organizations/:orgId/entitlements`

```jsonc
{
  "entitlements": { "seoistic.pro.enabled": true, "seoistic.sites.max": 5 },
  "sources": [{ "type": "license", "id": "uuid", "product": "seoistic", "plan": "professional" }],
  "version": 42,
  "resolved_at": "2026-07-26T07:00:00.000Z"
}
```
Cached in KV for 60s (`ent:{orgId}`); invalidated on every subscription/license
mutation that could change the answer.

---

## Billing

### `GET /organizations/:orgId/billing`

`{ subscriptions, recent_invoices (last 3), stripe_publishable_key }`.

### `POST /organizations/:orgId/billing/checkout` — billing roles, idempotency required

```jsonc
{ "price_id": "uuid", "quantity": 1, "coupon_code": "SAVE20", "success_url": "...", "cancel_url": "..." }
```
`{ "checkout_url": "https://checkout.stripe.com/..." }`. Coupon validity
(active, not expired, under its redemption cap) is checked before creating
the Stripe session; the redemption counter itself only increments once the
checkout actually completes (webhook-driven, exactly once — see below).

### `POST /organizations/:orgId/billing/portal` — billing roles

`{ "portal_url": "..." }` — Stripe customer portal.

### `GET /organizations/:orgId/subscriptions`

`{ "subscriptions": [SubscriptionView, ...] }`.

### `POST /organizations/:orgId/subscriptions/:id/cancel` — billing roles

Sets `cancel_at_period_end`; access continues until the paid period ends.
`409 already_cancelled` if already cancelled.

### `POST /organizations/:orgId/subscriptions/:id/reactivate` — billing roles

Undoes a pending cancellation before the period ends (resumes on Stripe too).
`409 subscription_ended` if it already fully ended, `409 not_cancelling` if
it was never scheduled to cancel.

### `POST /organizations/:orgId/subscriptions/:id/upgrade` — billing roles

```jsonc
{ "price_id": "uuid" }
```
Prorated plan change via Stripe (`proration_behavior: create_prorations`),
then recalculates entitlements immediately. `409 subscription_inactive` on a
cancelled/expired subscription.

### `GET /organizations/:orgId/invoices`

`{ "invoices": [InvoiceView, ...] }`.

### `POST /webhooks/stripe` — public, Stripe-signature authenticated

Every event is stored raw first (`webhook_events`, unique on
`(provider, provider_event_id)`); a redelivery of an event that already
**finished processing successfully** (`processed_at` set) is a no-op `{received:true, duplicate:true}` —
but a redelivery of an event whose prior attempt *failed* is reprocessed, not
silently skipped, because "the row already exists" and "already succeeded"
are different questions.

Handled types: `checkout.session.completed` (idempotent license issuance —
guarded by an existing-license lookup before ever calling `issue()`, plus a
new-order check before incrementing a coupon's redemption counter),
`invoice.paid` (renews subscription + licenses, clears any grace period),
`invoice.payment_failed` (subscription → `past_due`; every active license on
it enters its 7-day grace period immediately — `expires_at = NOW()`,
`grace_period_ends_at = NOW() + 7d`), `customer.subscription.updated`
(unrecognized Stripe statuses default to `paused` — **never** `active`),
`customer.subscription.deleted` (subscription `cancelled`, licenses `expired`).
Every one of these mutations writes its resulting domain event into the
transactional outbox in the same database transaction as the mutation itself
— see **Event Durability** below.

---

## Other Modules (route table)

Full request/response detail for these lives in their route files; listed
here so every live endpoint is at least indexed.

| Method & Path | Auth | Notes |
|---|---|---|
| `GET /me` | JWT | current user |
| `PATCH /me` | JWT | update profile |
| `GET /me/sessions` / `DELETE /me/sessions/:id` / `POST /me/sessions/revoke-others` | JWT | session management |
| `POST /auth/switch-org` | JWT | re-signs the access token for a different org |
| `GET /organizations` / `POST /organizations` | JWT | list/create orgs |
| `GET /organizations/:orgId` / `PATCH /organizations/:orgId` | JWT + membership | org profile |
| `GET /organizations/:orgId/members` / `PATCH .../members/:id` / `DELETE .../members/:id` | JWT + membership | membership management |
| `GET /organizations/:orgId/invitations` / `POST .../invitations` / `DELETE .../invitations/:id` | JWT + membership | invites |
| `POST /invitations/accept` | invite token | accept an invitation |
| `GET /organizations/:orgId/api-keys` / `POST .../api-keys` / `DELETE .../api-keys/:id` | JWT + membership | API key management |
| `GET /products` / `GET /products/:slug` | JWT | catalog browsing |
| `GET /organizations/:orgId/products` | JWT + membership | owned products |
| `GET /organizations/:orgId/ai-credits/balance` / `.../ledger` | JWT + membership | AI credit balance/ledger |
| `POST /usage/events` | JWT, API key, or `activation_token` in body | metered AI usage |
| `GET /organizations/:orgId/support` / `POST .../support` / `GET .../support/:id` / `POST .../support/:id/messages` | JWT + membership | support tickets |
| `GET /organizations/:orgId/notifications` / `POST .../:id/read` / `POST .../read-all` / `GET|PUT .../preferences` | JWT + membership | notifications |
| `GET /organizations/:orgId/audit` | JWT + membership | audit log |
| `GET /admin/stats` / `/admin/customers` / `/admin/organizations/:orgId` / `/admin/licenses` / `/admin/subscriptions` / `/admin/invoices` / `/admin/audit` / `/admin/system` | Admin | platform back-office reads |
| `POST /admin/licenses/:id/action` | Admin | suspend/reactivate/revoke/reset_activations |
| `POST /admin/subscriptions/:id/cancel` | Admin | staff-initiated cancellation |
| `POST /admin/webhooks/:eventId/retry` | Admin | replay a stored webhook event |
| `POST /admin/impersonate` | Admin + fresh MFA | mint a 30-minute restricted session |

---

## Event Durability (Transactional Outbox)

Critical mutations (license activate/deactivate/issue, every billing-webhook
effect) write their resulting domain event into `event_outbox` inside the
*same* database transaction as the mutation — never a separate `queue.send()`
call that could fail independently and silently lose the event. A Cron
Trigger (`* * * * *`, `apps/api/src/index.ts` `scheduled` export) drains
unprocessed rows onto the real Cloudflare Queue every minute; on failure a row
keeps its `attempts` counter and is retried on the next tick, up to
`max_attempts` (default 3), after which it's left in place (queryable) and
logged as exhausted rather than dropped.

The queue consumer (`events/handlers.ts`) deduplicates by event id (a
redelivered message never re-runs notification/side-effect logic twice) and
retries webhook fan-out per subscription on an immediate → 5 min → 15 min
schedule (`webhook_retry:{event_id}:{subscription_id}` in KV); once that
schedule is exhausted the subscription is suspended and its organization (or,
for a platform-wide subscription, the platform log) is notified.

Outbound webhook payload:
```jsonc
{ "id": "evt_...", "type": "license.activated", "occurred_at": "...", "correlation_id": null, "data": { "license_id": "...", "org_id": "...", "domain": "..." } }
```
Signature header: `X-WPistic-Signature: t=<unix>,v1=<hex hmac_sha256(secret, "${t}.${body}")>`.

---

## Row Level Security

Every authenticated request with a resolved organization sets
`app.current_org_id` (`SELECT set_config(...)`) on its connection before any
route handler runs (`middleware/tenant.ts`). This is defense-in-depth — every
query still carries its own explicit `organization_id` filter — but it only
has teeth when the API connects as a non-owner role: `wpistic_app` (created
in migration 012), which RLS actually restricts, unlike the schema-owning
role migrations run as. Production's Hyperdrive connection string should
point at `wpistic_app`, not the owning role.

---

## HMAC Response Signature Contract

```
derived_key = HMAC-SHA256(LICENSE_SIGNING_SECRET, license_key_hash)   // server-only
signature   = HMAC-SHA256(derived_key, canonical_json(payload_without_signature))
```
Hex-encoded throughout — no base64 anywhere in this contract.
`derived_key` is handed to the plugin once as `verification_key` at
activation/refresh so it can verify every cached response offline, without
ever holding the master secret. Canonical JSON: object keys sorted
recursively, no whitespace, array order preserved, `signature` excluded
before hashing. **Activation/refresh responses also carry `activation_token`
and `verification_key`** alongside the signed fields — those two are bolted
on *after* the signature is computed and must also be excluded before
verifying, exactly like `signature` itself (see
`wordpress-sdk/src/Security/HmacVerifier.php`). Identical implementation on
both sides (`apps/api/src/utils/crypto.ts` ↔
`wordpress-sdk/src/Security/HmacVerifier.php`), proven by matching golden
test vectors in each side's own test suite.

---

## Error Format

```jsonc
{ "error": { "code": "error_code", "message": "Human-readable message", "correlation_id": "uuid", "details": {} } }
```
Status codes in use: `400`, `401`, `402`, `403`, `404`, `409`, `422`, `429`, `500`.

## Rate Limits

| Scope | Limit | Window |
|---|---|---|
| Per IP (default) | 100 req | 1 minute |
| Per API key | 1000 req | 1 minute |
| `POST /licenses/activate` | 5 failed attempts | 1 hour, per IP |

Headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `Retry-After` (on 429).

## Idempotency

`X-Idempotency-Key: <8-255 url-safe chars>` on POST requests that support it
(license activation, billing checkout/cancel/reactivate/upgrade, usage
events) — the first response is cached in KV for 24h and replayed verbatim
for a retried request with the same key, scoped per org/IP + path.

## Changelog

### Phase 4 (current)
- RS256 activation tokens (was HS256); hex-only HMAC response signatures
  derived from `license_key_hash` (was base64, derived from `license_id`).
- License/activation status enums reconciled with the database
  (`cancelled` not `transferred`; `suspended` not `revoked` at the
  per-installation level) and rejection rules made consistent everywhere via
  one shared `evaluateLicenseLifecycle`.
- Server-side grace period pinned on first-observed expiry, applied
  consistently to activation, validation, refresh, and update authorization.
- Website connection tokens are `wpconn_{32 hex}` (was `wct_{64 hex}`);
  `max_websites` enforced on connect; disconnect cascades to deactivate
  linked license activations.
- Updates & downloads consolidated onto `update_packages`/`update_channels`
  (the old catalog-module `product_releases` path is retired); semantic
  version comparison; deterministic rollout percentage; single-use KV
  download grants.
- Transactional outbox for license/billing-webhook mutations; queue consumer
  dedup + per-subscription webhook retry/suspend.
- Billing: webhook idempotency no longer permanently skips a previously
  failed event; no duplicate license issuance on webhook replay; unknown
  Stripe statuses never default to `active`; failed payments apply a grace
  period to licenses; added reactivate/upgrade.
- RLS `app.current_org_id` actually set per request; `wpistic_app` restricted
  role added for production to connect as.

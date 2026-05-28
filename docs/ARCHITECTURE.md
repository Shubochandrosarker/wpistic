# WPistic Architecture

## Principles

- **WordPress is the SaaS engine.** No WooCommerce. Memberships/billing →
  Memberistic; licensing/entitlements → Licenseistic; auth/JWT → WPistic Auth Flow;
  forms/bookings → Bookingistic + WPistic Contact Form.
- **Loose coupling.** Plugins never call each other's internals. They communicate
  through WordPress **actions/filters**, brokered by the core's integration
  adapters and the bridge addon.
- **SaaS data in custom tables**, never in postmeta/usermeta.
- **Security first.** Every REST route has a `permission_callback`; inputs are
  sanitized; outputs escaped; secrets are stored only as keyed hashes.

## Data model (wpistic-core)

Custom tables (prefixed with `$wpdb->prefix`):

| Table | Purpose |
|-------|---------|
| `wpistic_workspaces` | Tenant root: slug, name, owner, plan slug/status, settings. |
| `wpistic_workspace_members` | User ↔ workspace with role (owner/admin/member/viewer). |
| `wpistic_websites` | Connected sites; site token stored as a SHA-256 HMAC hash. |
| `wpistic_activity_log` | Per-workspace event feed. |
| `wpistic_api_keys` | Developer keys; only `key_prefix` + keyed hash persisted. |

Schema lives in `Database/Schema.php` and is created on activation /
`maybe_upgrade()` on version bump.

## Service layer

`Plugin` is a tiny DI container. Services:
`WorkspaceService`, `WebsiteService`, `ActivityService`, `ApiKeyService`,
`DashboardService` (aggregator), plus `IntegrationRegistry`.

## Integration adapters

`IntegrationRegistry` discovers sibling plugins and returns adapters
(`MemberisticAdapter`, `LicenseisticAdapter`, `AuthAdapter`, `BookingisticAdapter`).
Each adapter:

- reports `is_available()` (used to build `enabledModules`),
- calls the sibling plugin via documented filters when present,
- returns safe fallbacks otherwise.

Documented contracts the sibling plugins should provide:

```
memberistic/api/plans            (filter)
memberistic/api/subscription     (filter, $default, $user_id)
memberistic/api/billing          (filter, $default, $user_id)
memberistic/api/invoices         (filter, $default, $user_id)

licenseistic/api/licenses        (filter, $default, $user_id)
licenseistic/api/downloads       (filter, $default, $user_id)
licenseistic/license/activate    (action, $args)
licenseistic/license/deactivate  (action, $args)
licenseistic/license/validate    (filter, $default, $args)
licenseistic/entitlement/grant   (action, $args)   ← from the bridge
licenseistic/entitlement/revoke  (action, $args)
licenseistic/entitlement/suspend (action, $args)
licenseistic/entitlement/update_limits (action, $args)
```

## REST API

First-party namespace `wpistic/v1`:

| Route | Method | Capability |
|-------|--------|------------|
| `/me` | GET | dashboard access |
| `/workspace` | GET / POST | access / `wpistic_manage_workspace` |
| `/dashboard` | GET | dashboard access |
| `/products` | GET | dashboard access |
| `/websites` | GET / POST | access / `wpistic_manage_websites` |
| `/websites/{id}` | DELETE | `wpistic_manage_websites` |
| `/activity` | GET | dashboard access |
| `/api-keys` | GET / POST | `wpistic_manage_api_keys` |
| `/api-keys/{id}` | DELETE | `wpistic_manage_api_keys` |
| `/api-keys/{id}/regenerate` | POST | `wpistic_manage_api_keys` |

**Guarded fallbacks** are registered for `memberistic/v1`, `licenseistic/v1`,
and `wpistic-auth/v1` — but only for routes the real plugin has **not** already
registered (checked via `rest_get_server()->get_routes()`), so the dashboard
always has a contract without clobbering the owning plugin.

### Security model

- `AbstractController::require_dashboard_access()` checks login +
  `wpistic_access_dashboard` cap + REST nonce (for cookie auth).
- Token/JWT requests (no cookie) bypass the nonce — WP already validated the token.
- `require_capability()` layers a specific cap on top.
- `RateLimiter` (object-cache, fixed window) guards login/activate/validate/key-create.
- `Security::hash_token()` = HMAC-SHA256 with `wp_salt()`. Raw secrets returned once.

## Dashboard (wpistic-dashboard)

- `Router` adds rewrite rules: `^dashboard/?$` and `^dashboard/(.+)/?$` →
  `wpistic_dashboard=1`, then `template_include` swaps in `templates/dashboard.php`.
  `redirect_canonical` is disabled for dashboard URLs so deep links survive.
- `Assets` enqueues the Vite bundle **only** on dashboard requests, reads
  `build/manifest.json`, emits the entry as a `type="module"` script, and isolates
  theme/block styles inside the SPA.
- `BootData` localizes `wpisticBoot`: `restUrl`, `restNamespaces`, `nonce`,
  `currentUser` (+ caps), `workspace`, `plan`, `enabledModules`, asset URLs.
- React app: `react-router-dom` with `basename=/dashboard`. Pages map 1:1 to the
  required child routes. Shared `useApi` hook + `api` client; `ToastProvider`,
  skeletons, empty/error states, and the full set of account banners (trial ending,
  payment failed, no website, no/expired/suspended license, key regenerated).

## Bridge (licenseistic-memberistic-addon)

Listens on Memberistic lifecycle actions and re-emits Licenseistic entitlement
actions, using a filterable `PlanMap` (plan slug → products + domain/download/usage
limits):

| Memberistic event | Effect |
|-------------------|--------|
| `memberistic_subscription_activated` | grant entitlements for mapped products |
| `memberistic_subscription_renewed` | restore access |
| `memberistic_subscription_cancelled` | suspend related licenses |
| `memberistic_payment_failed` | limit/suspend licenses, mark plan past_due |
| `memberistic_plan_changed` | revoke removed products, grant new, update limits |

It also keeps the WPistic workspace plan + activity log in sync when core is active.

## Theme (wpistic-theme)

- `theme.json` carries the palette, type, spacing, and gradients from the tokens.
- Presentation only — product/pricing data come from filters (`wpistic/theme/*`)
  so business logic stays in plugins.
- Public assets load only on public pages (skipped when `wpistic_dashboard` is set).
- Page templates: Pricing, Products, Contact, Marketing Section, Legal, plus the
  homepage (`front-page.php`). Forms render via the Bookingistic / Contact Form
  shortcodes resolved by the core adapter, with a graceful fallback.

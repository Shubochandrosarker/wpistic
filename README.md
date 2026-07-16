# WPistic — WordPress SaaS Platform

Production rebuild of the WPistic ecosystem hub from the approved UI design.
WordPress is the SaaS engine; **WooCommerce is intentionally not used**. Billing,
licensing, and auth are handled by your dedicated plugins, wired together through
clean integration points.

## Repository layout

| Path | What it is |
|------|------------|
| `wpistic-core/` | Foundation plugin: custom DB tables, service layer, REST API (`wpistic/v1` + guarded fallbacks for `memberistic/v1`, `licenseistic/v1`, `wpistic-auth/v1`), security helpers, and integration adapters. |
| `wpistic-dashboard/` | Mounts the React app at `/dashboard` with client-side routing; enqueues its Vite bundle only on dashboard routes; localizes the `wpisticBoot` object. |
| `licenseistic-memberistic-addon/` | Event bridge: maps Memberistic subscription lifecycle → Licenseistic entitlements. |
| `wpistic-theme/` | Custom marketing theme (public site) built from the design tokens, with `theme.json`, template parts, and page templates. |
| `wpistic-marketing/` | Standalone Next.js marketing site for `www.wpistic.com` — full replacement in progress for `wpistic-theme`. |
| `docs/ARCHITECTURE.md` | Deeper architecture notes, REST contract, and extension points. |
| `docs/SETUP.md` | Step-by-step local setup for both the WordPress app and the `wpistic-marketing` front end. |

## Install

Copy each folder into your WordPress install:

```
wp-content/plugins/wpistic-core/
wp-content/plugins/wpistic-dashboard/
wp-content/plugins/licenseistic-memberistic-addon/
wp-content/themes/wpistic-theme/
```

Then:

1. Activate **WPistic Core** (creates tables + roles), then **WPistic Dashboard**, then the **Bridge**.
2. Activate the **WPistic** theme.
3. Visit **Settings → Permalinks** once (flushes the `/dashboard` rewrite rules).
4. Install your real **Memberistic**, **Licenseistic**, **WPistic Auth Flow**,
   **Bookingistic**, and **WPistic Contact Form** plugins — the adapters detect
   and use them automatically. Until then, safe fallbacks keep everything working.

## Dashboard development

```bash
cd wpistic-dashboard
npm install
npm run build      # outputs build/ (committed so it works out of the box)
npm run dev        # Vite dev server (HMR) for local component work
```

The PHP enqueuer reads `build/manifest.json` to resolve hashed asset filenames.

## Design source of truth

Design tokens live in `*/assets/.../tokens.css` (shared by theme + dashboard) and
in the theme’s `theme.json`. The dashboard React components are refactored,
reusable ports of the approved UI screens.

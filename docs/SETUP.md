# WPistic — Setup Guide

This guide covers the two things you'd set up to work on WPistic locally:

1. **[The App](#part-1--the-app-wordpress-saas-platform)** — the WordPress-based SaaS
   platform itself: `wpistic-core` (backend/REST API), `wpistic-dashboard` (the React
   front end mounted at `/dashboard`), and `licenseistic-memberistic-addon` (the billing
   ⇄ licensing bridge).
2. **[The Front End](#part-2--the-front-end-wpistic-marketing)** — `wpistic-marketing`,
   the standalone Next.js marketing site for `www.wpistic.com`.

These are independent codebases with independent toolchains — you can set up either one
without the other. If you're only touching marketing copy/pages, skip straight to Part 2.

---

## Part 1 — The App (WordPress SaaS platform)

### What you're installing

| Path | What it is | Required? |
|------|------------|------------|
| `wpistic-core/` | Foundation plugin — custom DB tables, service layer, REST API (`wpistic/v1`), security helpers. | Yes, first |
| `wpistic-dashboard/` | Mounts the React dashboard app at `/dashboard`. | Yes |
| `licenseistic-memberistic-addon/` | Event bridge: Memberistic subscription events → Licenseistic entitlements. | Only if you use both Memberistic + Licenseistic |
| `wpistic-theme/` | Legacy PHP marketing theme (public site). Being replaced by `wpistic-marketing`, see Part 2. | No, optional |

### Prerequisites

- **PHP 8.0+**
- **WordPress 6.4+**
- MySQL 5.7+ / MariaDB 10.3+ (whatever your WordPress install already uses)
- A local WordPress environment — any of these work identically:
  - [`wp-env`](https://developer.wordpress.org/block-editor/reference-guides/packages/packages-env/) (official, Docker-based)
  - [Local](https://localwp.com/), MAMP/XAMPP, or your own LAMP/LEMP stack
- **Composer** — only needed if you're running the PHP test suites (not required at runtime)
- **Node.js 18+** and npm — only needed if you're building/developing the dashboard's React bundle

None of the plugins require WooCommerce — billing, licensing, and auth are handled by
dedicated plugins/adapters, not WooCommerce.

### Install

Copy (or symlink, for local dev) each folder into your WordPress install:

```bash
wp-content/plugins/wpistic-core/
wp-content/plugins/wpistic-dashboard/
wp-content/plugins/licenseistic-memberistic-addon/   # optional
wp-content/themes/wpistic-theme/                     # optional, see Part 2
```

Then, in the WordPress admin:

1. **Activate plugins in this order:**
   1. **WPistic Core** — creates the custom DB tables (`wpistic_workspaces`,
      `wpistic_workspace_members`, `wpistic_websites`, `wpistic_activity_log`,
      `wpistic_api_keys`) and registers the `wpistic_manage_*` / `wpistic_access_dashboard`
      capabilities on relevant roles.
   2. **WPistic Dashboard** — registers the `/dashboard` rewrite rules and enqueues the
      React bundle.
   3. **Licenseistic ⇄ Memberistic Bridge** (if installed) — starts listening for
      Memberistic lifecycle events.
2. **Activate the WPistic theme** (only if you're not using the new `wpistic-marketing`
   site for the public-facing pages — see Part 2).
3. **Visit Settings → Permalinks and click Save once.** This is required — it flushes
   the rewrite rules the Dashboard plugin registers for `/dashboard` and
   `/dashboard/(.+)`. Skipping this step is the #1 cause of a 404 on `/dashboard`.
4. **Install the real product plugins** as you get them — **Memberistic**,
   **Licenseistic**, **WPistic Auth Flow**, **Bookingistic**, **WPistic Contact Form**.
   `wpistic-core`'s `IntegrationRegistry` auto-detects each one via `is_available()` and
   wires up the real adapter. Until a given plugin is installed, safe fallback data is
   returned instead, so the dashboard stays fully functional in a partial setup.

### Verifying it worked

- Visit `/dashboard` on your site — you should land on the React app (not a 404 and not
  the theme).
- Log in as an admin and confirm `/wp-json/wpistic/v1/me` returns your user + workspace
  JSON (visit the URL directly, or check the Network tab while the dashboard loads).
- Check **Users → Profile** (or your role editor of choice) for the new
  `wpistic_access_dashboard`, `wpistic_manage_workspace`, `wpistic_manage_websites`, and
  `wpistic_manage_api_keys` capabilities — these should exist on the administrator role
  after Core activates.

### REST API quick reference

First-party namespace: **`wpistic/v1`**

| Route | Method | Requires |
|-------|--------|----------|
| `/me` | GET | dashboard access |
| `/workspace` | GET / POST | dashboard access / `wpistic_manage_workspace` |
| `/dashboard` | GET | dashboard access |
| `/products` | GET | dashboard access |
| `/websites` | GET / POST | dashboard access / `wpistic_manage_websites` |
| `/websites/{id}` | DELETE | `wpistic_manage_websites` |
| `/activity` | GET | dashboard access |
| `/api-keys` | GET / POST | `wpistic_manage_api_keys` |
| `/api-keys/{id}` | DELETE / POST `.../regenerate` | `wpistic_manage_api_keys` |

Guarded fallback routes are also registered under `memberistic/v1`, `licenseistic/v1`,
and `wpistic-auth/v1` — but only for routes the *real* plugin hasn't already registered,
so installing the real plugin later never conflicts. See `docs/ARCHITECTURE.md` for the
full adapter/filter contract if you're building one of those sibling plugins.

### Dashboard (React front end) development

The dashboard's build output (`wpistic-dashboard/build/`) is committed, so the plugin
works out of the box even if you never run Node. You only need this section if you're
changing dashboard code.

```bash
cd wpistic-dashboard
npm install

npm run dev        # Vite dev server with HMR, for fast iteration on components
npm run build      # Production build → build/ (manifest.json + hashed assets)
npm run preview    # Preview the production build locally
npm test           # Vitest — run the unit/component test suite
```

The PHP `Assets` class reads `build/manifest.json` to resolve the current hashed entry
filename, so **always run `npm run build` and commit the result** before shipping a
dashboard change — the PHP side does not run Vite itself.

> `npm run dev`'s HMR server is standalone (not proxied through WordPress). For most UI
> work this is fine since components are largely self-contained; if you need live data
> from a real WordPress install while iterating, run `npm run build` after each change
> instead and reload the actual `/dashboard` page.

### Running the PHP test suites

Both `wpistic-core` and `licenseistic-memberistic-addon` ship a dev-only PHPUnit +
Brain Monkey suite (not required at runtime — this is purely for contributors):

```bash
cd wpistic-core                      # or licenseistic-memberistic-addon
composer install
vendor/bin/phpunit                   # or: composer test
```

These tests run against WordPress function stubs (Brain Monkey) and a `FakeWpdb` test
double — no real WordPress or database install needed to run them.

### Troubleshooting

| Symptom | Cause / Fix |
|---|---|
| `/dashboard` 404s | You haven't visited **Settings → Permalinks** since activating WPistic Dashboard. Visit it once (no changes needed) and save. |
| Dashboard loads a blank page | Check `wpistic-dashboard/build/manifest.json` exists — if you deleted `build/` locally without rebuilding, run `npm run build` inside `wpistic-dashboard/`. |
| REST calls return 401/403 | Confirm the logged-in user's role has `wpistic_access_dashboard` (added by Core on activation). Deactivating/reactivating Core re-runs role registration if it's missing. |
| Memberistic/Licenseistic data looks like placeholder data | Expected until you install the real plugin — `IntegrationRegistry` falls back to safe defaults when a sibling plugin isn't active. |
| DB tables missing after activation | Check `Schema::install()` ran — deactivate and reactivate **WPistic Core**; `maybe_upgrade()` also re-runs on every version bump. |

---

## Part 2 — The Front End (`wpistic-marketing`)

This is the standalone **Next.js 16** (App Router, Turbopack, React 19, Tailwind CSS v4)
marketing site for **www.wpistic.com** — home, pricing, products, marketplace, bundles,
solutions, customers, developers, docs, downloads, support, blog, legal pages, and
login/register hand-offs to the real dashboard app. It's a completely separate codebase
from Part 1 — no shared build step, no PHP involved.

### Prerequisites

- **Node.js 20+** and npm (this is stricter than the dashboard's Node 18+, matching
  Next.js 16's own minimum)

There's no database, no `.env` file, and no external API to configure — every page is
statically generated at build time from the typed data in `lib/*.ts`
(`products.ts`, `pricing.ts`, `solutions.ts`, `testimonials.ts`, `blog.ts`, `nav.ts`,
`site.ts`).

### Install & run

```bash
cd wpistic-marketing
npm install

npm run dev      # Turbopack dev server with HMR → http://localhost:3000
npm run build    # Production build — statically generates every route
npm start        # Serve the production build (run `npm run build` first)
npm run lint     # ESLint (next/core-web-vitals + TypeScript rules)
```

A clean `npm run build` currently generates **49 routes** as static or SSG HTML
(including `/sitemap.xml` and `/robots.txt`), with zero TypeScript errors.

### Project structure

```
wpistic-marketing/
├── app/                  # Routes (Next.js App Router — one folder per URL segment)
│   ├── layout.tsx        # Root layout: fonts, <Header>/<Footer>, Organization JSON-LD
│   ├── globals.css       # Design tokens (@theme) — ported from wpistic-dashboard's tokens.css
│   ├── sitemap.ts        # Generates /sitemap.xml from lib/* data
│   ├── robots.ts         # Generates /robots.txt
│   └── .../page.tsx      # Each route's page (Server Component by default)
├── components/
│   ├── ui/               # Shared UI kit — Button, Card, Badge, Icon, ProductCard, etc.
│   └── layout/            # Header, Footer
└── lib/                   # Typed content/data layer (products, pricing, nav, blog, site constants)
```

Conventions used throughout, if you're adding a page:

- Server Components by default; add `"use client"` only for actual interactivity
  (a toggle, a filter, a mobile menu).
- Every `page.tsx` exports `export const metadata: Metadata = {...}`.
- Reuse `components/ui/*` — don't introduce new spacing/color patterns; the palette and
  type scale come from `app/globals.css`'s `@theme` block.
- Dynamic routes (`products/[slug]`, `customers/[slug]`, `blog/[slug]`) use
  `generateStaticParams` + async `generateMetadata({ params: Promise<{...}> })` — `params`
  is a Promise everywhere in Next.js 16, not a plain object.

### Deployment

The site has no server-side dependencies (no database, no API keys) — it's a fully
static/SSG Next.js app and deploys to any Next.js-compatible host (Vercel, or
`npm run build && npm start` behind a reverse proxy / Node host). Auth (`/login`,
`/register`) and the real dashboard link out to `app.wpistic.com` rather than being
served from this app.

### Troubleshooting

| Symptom | Cause / Fix |
|---|---|
| CSS/styling missing after a rebuild while a dev/prod server was already running | A stale `next start`/`next dev` process is still serving old build hashes. `pkill -f "next-server"` (or `next start`), then restart — don't run `npm run build` while an old server from a previous build is still up. |
| `EADDRINUSE: address already in use :::3000` | Something is already bound to port 3000 — find and kill it (`pkill -f "next start"`) before starting again, or the old process silently keeps serving stale output. |
| TypeScript error only on `params`/`searchParams` | This project is on Next.js 16, where route `params` are `Promise`s — `await params` before destructuring, in both `generateMetadata` and the page component. |

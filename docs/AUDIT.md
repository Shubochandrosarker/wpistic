# WPistic — System Audit, Gaps & Improvement Roadmap

**Date:** 2026-06-11
**Scope:** `wpistic-core` (foundation plugin + REST API), `wpistic-dashboard`
(React SPA), `licenseistic-memberistic-addon` (bridge), `wpistic-theme`
(marketing site).
**Goal:** A complete audit of core + UI + UX, a prioritised gap list (15),
an improvement list (15), an advanced-feature roadmap, and a fully responsive
dashboard with a light/dark theme toggle (delivered in this branch).

---

## 1. Executive summary

WPistic is architecturally strong: clean DI service layer, custom SaaS tables
(no postmeta abuse), permission-guarded REST routes, hashed secrets, and a
loosely-coupled adapter/bridge model. The weak spots are **breadth, not
foundation**: there are no automated tests, several advertised features are
UI-only stubs (search, webhooks, billing actions, team management), list
endpoints don't paginate, and — until this branch — the dashboard had **no dark
mode and was not responsive** (fixed-pixel sidebar, no mobile navigation).

This PR closes the two highest-visibility UX gaps (dark mode + responsive) and
documents the rest so they can be prioritised.

---

## 2. What shipped in this branch

| Area | Change |
|------|--------|
| **Light/Dark theme** | A full token-based theming system. `assets/tokens.css` now defines an `--app-*` surface/text/border layer with a `[data-theme="dark"]` override. A no-flash boot script in `templates/dashboard.php` applies the saved/OS theme before first paint. |
| **Theme toggle** | New `lib/theme.js` (preference + `system`/OS-follow + persistence) and a `ThemeToggle` sun/moon button in the topbar. Choice is stored in `localStorage`. |
| **Responsive layout** | The 256px sidebar becomes a slide-in drawer below 900px with a hamburger button, backdrop, Escape-to-close, and auto-close on navigation. Stat/product/split grids collapse via `.wpt-grid-*` utilities; page padding and the topbar search/username adapt to small screens. |
| **Token refactor** | Hardcoded hex across `AppShell`, `atoms`, `widgets`, `states`, and all 10 pages was replaced with `--app-*` variables so both themes render correctly. |
| **A11y** | Added `:focus-visible` rings, `aria-label`/`aria-pressed` on icon buttons, and keyboard handling for the drawer. |

> The marketing **theme** (`wpistic-theme`) keeps its existing palette; extending
> the same dark-mode token bridge to the public site is listed as a follow-up
> (Improvement #14).

---

## 3. Core audit (`wpistic-core` + bridge)

**Strengths**

- Tiny DI container (`Plugin`) with focused services; clear separation of
  REST controllers, services, and integration adapters.
- Security model is sound: every route has a `permission_callback`,
  `RateLimiter` on sensitive actions, HMAC-SHA256 token hashing, raw secrets
  returned once.
- Custom tables with a `maybe_upgrade()` version gate; SaaS data kept out of
  postmeta/usermeta.
- Graceful degradation via guarded REST fallbacks for sibling plugins.

**Weaknesses** (expanded in the gap list)

- No tests, no pagination on list endpoints, unbounded `activity_log` growth,
  no outbound webhooks, no server-side caching of the dashboard aggregate,
  no team/invite endpoints despite a `workspace_members` table, and several
  "live" features are fallbacks only.

---

## 4. UI / UX audit (`wpistic-dashboard`)

**Strengths**

- Coherent visual language, real loading skeletons, empty/error states, and a
  complete set of account banners (trial, payment failed, no website, license
  states, key regenerated).
- Sensible component decomposition (atoms / widgets / states / pages).

**Weaknesses found (most now fixed in this branch)**

| Symptom | Status |
|---------|--------|
| No dark mode | ✅ Fixed |
| Not responsive; fixed 256px sidebar, no mobile nav | ✅ Fixed |
| Colors hardcoded instead of using design tokens | ✅ Fixed (dashboard) |
| Topbar search is decorative (does nothing) | ⏳ Gap #10 |
| Destructive actions (disconnect / revoke / deactivate) fire with no confirm | ⏳ Gap #6 |
| One-time token shown in a *dismissible* banner (easy to lose) | ⏳ Improvement #7 |
| No React error boundary — one page error blanks the whole app | ⏳ Gap #13 |
| `ModulePage` routes never pass `module`, so gated modules always render "ready" | ⏳ Gap #9 (real bug) |
| JS strings not translatable (PHP is `__()`-ready, React is not) | ⏳ Improvement #12 |
| Muted text `#9499BA` on white is borderline WCAG AA | ⏳ Improvement #11 |

---

## 5. The 15 gaps

| # | Gap | Area | Impact | Effort |
|---|-----|------|--------|--------|
| 1 | **No automated tests** — zero PHPUnit/JS coverage; refactors are unguarded. | Core + UI | High | M |
| 2 | **List endpoints don't paginate** (`/websites`, `/activity`, `/api-keys`, `/products`) — they return every row. | Core | High | M |
| 3 | **`activity_log` has no retention/pruning** — the table grows forever. | Core | Med | S |
| 4 | **No outbound webhooks** even though the Developers page advertises them. | Core | High | M |
| 5 | **No team / invite flow** — `workspace_members` exists but there are no endpoints or UI to invite, change roles, or remove members. | Core + UI | High | L |
| 6 | **No confirmation on destructive actions** — disconnect site, revoke key, and deactivate license execute on first click. | UX | Med | S |
| 7 | **No server-side caching** — `DashboardService` re-aggregates on every request; no transient/object-cache layer. | Core | Med | M |
| 8 | **Billing is non-functional** — "Change plan" / "Payment method" are no-op buttons; no real checkout handoff to Memberistic. | Core + UI | High | L |
| 9 | **Gated modules always show "ready"** — `App.jsx` never passes the `module` prop to `ModulePage`, so `moduleEnabled()` is bypassed. | UI (bug) | Med | S |
| 10 | **Global search is decorative** — the topbar input has no handler, no command palette, no results. | UX | Med | M |
| 11 | **No onboarding/setup wizard** — empty state is a single "Create workspace" button; no guided first-run. | UX | Med | M |
| 12 | **No in-app notifications** — no bell, no feed, no real-time events; users must refresh. | Core + UI | Med | L |
| 13 | **No React error boundary** — an exception in any page unmounts the whole SPA to a blank screen. | UI | Med | S |
| 14 | **No observability** — no health endpoint, no structured error logging, no API metrics. | Core | Med | M |
| 15 | **No i18n on the client** — every React string is hardcoded English; the PHP side is translatable but the SPA isn't. | UI | Med | M |

*Effort: S = <1 day, M = a few days, L = 1–2 weeks.*

---

## 6. The 15 improvements

| # | Improvement | Why it helps |
|---|-------------|--------------|
| 1 | **Pagination + cursor params** on all list endpoints, with `total`/`hasMore` in responses and "Load more" in tables. | Scales past a few dozen rows; keeps payloads small. |
| 2 | **Confirm dialogs + optimistic UI** for revoke/disconnect/deactivate, with undo toasts. | Prevents accidental, irreversible actions. |
| 3 | **Command palette (`⌘K`)** wired to the topbar search — jump to pages, sites, licenses, and actions. | Turns dead UI into the fastest way to navigate. |
| 4 | **First-run onboarding checklist** (create workspace → connect site → activate license → invite team) with progress. | Faster time-to-value, higher activation. |
| 5 | **Team management UI** — invite by email, role dropdown (owner/admin/member/viewer), pending invites, remove. | Unlocks the existing members table; multi-seat plans. |
| 6 | **Real billing flow** — plan picker, Memberistic checkout/portal handoff, proration preview, invoice PDFs. | Converts trials; removes the biggest "dead button" set. |
| 7 | **Secret reveal pattern** — show one-time keys/tokens in a copy-locked modal with an explicit "I've stored it" gate, not a dismissible banner. | Stops users from losing credentials. |
| 8 | **Webhooks UI + delivery log** — register endpoints, see attempts/retries, replay failures. | Pairs with Gap #4; core to a developer platform. |
| 9 | **Per-action loading & disabled states** (spinners on buttons, skeleton-on-refetch) instead of text swaps. | Clearer feedback; fewer double-submits. |
| 10 | **React error boundary + friendly fallback** with a "reload / report" action. | One page error no longer kills the app. |
| 11 | **Contrast & a11y pass** — bump muted greys to AA, label all icons, trap focus in drawer/modals, audit with axe. | Compliance + usability for everyone. |
| 12 | **Client i18n** — extract strings to a dictionary, expose `wpisticBoot.locale`, support RTL. | Opens non-English markets. |
| 13 | **Saved table preferences** — sorting, column visibility, page size, persisted per user. | Power-user friendliness on data-heavy pages. |
| 14 | **Dark mode for the marketing theme** — extend the same token bridge to `wpistic-theme` + `theme.json` so the whole brand supports it. | Consistency across public site and app. |
| 15 | **Density toggle + remembered layout** (comfortable/compact) and a "reduce motion" respect for `prefers-reduced-motion`. | Personalisation; motion-sensitivity support. |

---

## 7. Advanced features to add (easy for users, high leverage)

These build on the existing adapters/bridge so they stay loosely coupled.

1. **AI assistant in-app** (the `AI Agents` slot) — a "WPistic Copilot" that can
   answer "why is this license suspended?", draft automations, and run safe
   read actions via the REST API. Surface it behind the existing `⌘K` palette.
2. **Automations builder** (the `Automations` slot) — a visual when-this-then-that
   editor on top of the bridge's action/filter model (e.g. *payment failed →
   suspend license → email customer*). Ship with a few one-click templates.
3. **Unified Inbox + CRM** (existing slots) — WhatsApp/web-chat/email/tickets
   into one thread view, contacts auto-synced from license/website events.
4. **Analytics rollups** — a nightly cron that snapshots per-workspace metrics
   into a summary table so the Analytics page is instant (avoids live joins).
5. **Status page / health widget** — surface site connector health, license
   validity, and webhook delivery health at a glance.
6. **Audit trail export** — CSV/JSON export of the activity log with filters.
7. **Granular API scopes** — per-key scopes (read/write per resource) on top of
   the current all-or-nothing keys.
8. **Multi-workspace switcher** — the sidebar workspace card becomes a dropdown
   for users who belong to several workspaces.

**"Easy for users" principles to keep:** every advanced feature should ship with
a sensible default, an empty-state that teaches, one-click templates where
possible, and a non-destructive preview before any write.

---

## 8. Recommended sequencing

1. **Quick wins (S):** Gap #9 (module-prop bug), #3 (log pruning), #6 (confirms),
   #13 (error boundary), Improvement #7 (secret modal).
2. **Platform (M):** Gaps #2 (pagination), #4 (webhooks), #7 (caching), #14
   (observability), Improvements #1/#3/#9.
3. **Growth (L):** Gaps #5 (teams), #8 (billing), #12 (notifications), plus the
   advanced AI/automation/inbox slots.

---

*This document is the source of truth for the audit. The dark-mode + responsive
work referenced in §2 is implemented in this same branch.*

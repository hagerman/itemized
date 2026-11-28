# Design

## Context

See `proposal.md` for motivation and scope. Currently `web/src/pages/SettingsPage.tsx` (916 lines) and `web/src/components/NotificationsCard.tsx` (382 lines) render all 8 settings cards vertically in one scroll. On the backend, `PATCH /api/settings` in `internal/api/server.go` already performs partial key-by-key updates, so splitting the monolithic Instance Configuration form into independent forms requires no Go API changes.

Documentation is authored once under `docs/` and compiled via `make docs-build` into both the static site and `web/src/generated/help/` plus `README.md`, verified by `make docs-check` (front matter, 600-word limit, brand casing, `APP_SCREENS` coverage, and `openspec/specs/` capability coverage). Currently, `push-notifications` has no docs page and `NotificationsCard` has no `settings/notifications` screen ID or `Learn more` button.

## Goals / Non-Goals

**Goals:**
- Provide a scalable, visually consistent sub-navigation architecture (independent split-pane desktop left vertical sub-nav on `>= md` + custom styled grouped dropdown menu on mobile `< md`) shared by both `/settings` and `/help`.
- Eliminate vertical and horizontal shifting of the left sub-nav across tall and short panels and allow the left nav and right content pane to scroll independently on desktop.
- Sync active Settings panel selection with `/settings?tab=<id>` so users, docs, and screenshot scripts can deep-link directly to any panel.
- Keep `SettingsPage.tsx` thin by extracting focused panel components under `web/src/components/settings/`.
- Ensure 100% of Settings panels and options are documented, linked via contextual Help (`Learn more`), registered in `APP_SCREENS`, and reflected in automated screenshots.

**Non-Goals:**
- Adding new backend settings or changing `PATCH /api/settings` behavior.
- Adding separate React Router routes per Settings tab (e.g., `/settings/printing`); `/settings` remains a single route with `?tab=<id>`.
- Redesigning individual form fields or changing API contracts.

## Decisions

### 1. Navigation layout: Independent split-pane desktop sub-nav + custom styled grouped mobile dropdown
- **Choice**: Add an optional `splitPane?: boolean` prop to `web/src/components/Layout.tsx` (passed for `/settings`, `/help`, and `/help/*` in `web/src/App.tsx`) so that on desktop (`>= md`), `<main>` switches to `md:overflow-hidden md:p-0` while retaining standard scrolling on mobile (`< md`). Inside `web/src/components/SectionNavLayout.tsx`:
  - **Desktop (`>= md`)**: Render `md:flex md:h-full md:min-h-0 md:overflow-hidden` with two independent `overflow-y-auto` panes: a fixed-width (`md:w-60 md:shrink-0 md:overflow-y-auto md:border-r md:border-slate-200 md:p-4 dark:md:border-slate-800`) left sub-navigation anchored consistently at `top: 0` (no sticky offset drift), and a `md:flex-1 md:min-w-0 md:overflow-y-auto md:p-6` right content pane (containing a `max-w-4xl` wrapper) that resets `scrollTop = 0` when switching sections or guides.
  - **Mobile (`< md`)**: Render a custom styled dropdown trigger button (displaying the active section icon, label, optional group badge, and chevron, with `aria-expanded` and `aria-haspopup="menu"`) that opens a styled popover panel (`rounded-2xl border bg-white p-2 shadow-xl dark:border-slate-800 dark:bg-slate-900 max-h-[65dvh] overflow-y-auto`) showing uppercase group headings (`Personal` / `Admin` on Settings; `Get started` / `Use itemized` / `Configure & connect` on Help), icons, and active checkmark/highlight. Closes on item selection, outside click, or `Escape`.
- **Alternatives considered**:
  - Sticky nav inside a single scrolling `<main>` — causes vertical offset differences between short (`top: 0`) and scrolled tall (`top-6`) pages, and prevents the Help sidebar from scrolling independently of long articles.
  - Native mobile `<select>` with `<optgroup>` — uses browser-native picker chrome that feels visually disconnected from itemized's custom rounded card and popover styling.
  - Horizontally scrollable mobile pill strip — loses group hierarchy (`Personal` vs. `Admin`) and clips labels off-screen on narrow viewports.

### 1b. Shared sub-navigation on `/help` and `/help/*`
- **Choice**: Apply `SectionNavLayout` (with `splitPane` on `Layout`) to `web/src/pages/HelpPage.tsx` so `/help` and `/help/*` share the exact same independent desktop left sub-nav (`Overview` plus grouped guides under `Get started`, `Use itemized`, and `Configure & connect`) and custom styled grouped mobile dropdown menu as Settings.
- **Preserved landing behavior**: On `/help` (Overview), the right content pane continues to auto-focus the search input, render the 9 common task entries, and list all categorized guides. On `/help/:slug`, the right content pane renders the article card while the independently scrollable left sub-nav / mobile dropdown keeps every guide one click or tap away.

### 2. Panel taxonomy and tab IDs
- **Personal** (all roles):
  - `account` — **Account & Preferences** (Account email/password card + Appearance & Quick Actions card)
  - `notifications` — **Notifications** (`NotificationsCard`)
  - `api-tokens` — **API Tokens** (Personal Bearer tokens card)
- **Admin** (`user.role === "admin"` only):
  - `general` — **General** (`base_url`, `due_date_average_count`)
  - `users-sso` — **Users & SSO** (Household Users card + OIDC SSO card)
  - `ai` — **AI & Classification** (LLM Product Classification card)
  - `printing` — **Label Printing** (Label Printers card + ZPL Label Templates card)
- **Fallback rule**: Unknown tab values or admin tab IDs accessed by a `member` resolve to `account`. Admin React Query hooks (`settings`, `users`, `printers`, `label-templates`) remain gated by `enabled: isAdmin` (and optionally active tab where appropriate, while keeping `isAdmin` gating strict so members never hit admin endpoints).

### 3. URL state via `useSearchParams`
- **Choice**: Read and update `?tab=<id>` via React Router's `useSearchParams`. Clicking a tab updates `?tab=<id>` (replacing or pushing cleanly; omitting `?tab` or setting `?tab=account` shows `account`).
- **Alternative considered**: Local `useState` only. Rejected because refresh loses context, deep-links from docs/Help aren't possible, and Playwright screenshot capture would have to click UI labels instead of navigating directly.
- **Test impact**: `SettingsPage.test.tsx` currently renders `<SettingsPage />` without a router; wrap test renders in `<MemoryRouter>` (matching `HelpPage.test.tsx`).

### 4. Independent save forms for General, OIDC, and AI & Classification
- **Choice**: Split the former `Instance Configuration` form into three standalone forms (General in `general`, OIDC in `users-sso`, LLM in `ai`), each sending only its own keys to `PATCH /api/settings` and invalidating `["settings"]` (and `["auth-status"]` where relevant, e.g., OIDC/LLM).
- **Rationale**: Prevents editing OIDC from accidentally submitting stale General or LLM fields, and gives each panel a clear local Save button.

### 5. Modular component structure
- Extract shared style constants and panel components into `web/src/components/settings/`:
  - `AccountPreferencesPanel.tsx` (Account + Appearance & Quick Actions)
  - `ApiTokensPanel.tsx`
  - `GeneralSettingsPanel.tsx`
  - `UsersSsoPanel.tsx` (Household Users + OIDC)
  - `AiClassificationPanel.tsx` (LLM Product Classification)
  - `LabelPrintingPanel.tsx` (Label Printers + ZPL Label Templates)
  - Reuse `web/src/components/NotificationsCard.tsx` for the `notifications` panel, adding the `Learn more` button (`data-help-screen="settings/notifications"`).

### 6. Documentation & screenshot alignment
- Create `docs/configure/push-notifications.md` (under 600 words, `audience: user`, `entry_point: configure`, `capabilities: [push-notifications]`, `screens: [settings/notifications]`), leading with `../assets/settings-notifications.png`.
- Register `{ id: "settings/notifications", kind: "settings", label: "Push Notifications" }` in `web/src/screens.ts` and update `web/src/screens.test.ts` (including checking `settings/api-tokens` and `settings/notifications` and scanning `NotificationsCard.tsx` / `components/settings/` or matching all registered settings screen IDs).
- Update `docs/configure/settings.md`, `accounts-and-sso.md`, `api-tokens-and-integrations.md`, `label-printing.md`, `upc-and-ai.md`, `docs/use/inventory-and-expiration.md`, and `docs/self-hosting/configuration.md` so all navigation paths match the new Personal / Admin panel names and every setting is accurately reflected.
- Update `web/scripts/docs/screenshots.ts` to capture `settings.png` (`/settings`), `settings-notifications.png` (`/settings?tab=notifications`), and `settings-printers.png` (`/settings?tab=printing`).

## Risks / Trade-offs

- **Existing tests expecting all Settings cards mounted simultaneously** -> Update `SettingsPage.test.tsx` and `HelpPage.test.tsx` to navigate to the target tab (via click or `initialEntries={["/settings?tab=..."]}`) while verifying role-based visibility and non-admin API isolation.
- **`screens.test.ts` static regex scan of `SettingsPage.tsx`** -> Moving `data-help-screen` attributes into sub-components under `web/src/components/settings/` and `NotificationsCard.tsx` means `screens.test.ts` should scan all settings component files (not just `SettingsPage.tsx`) so missing registrations are still caught.
- **Word count & brand-casing rules in `docs-check`** -> Keep `docs/configure/push-notifications.md` concise (< 600 words), use lowercase `itemized` mid-sentence, and run `make docs-build && make docs-check` to verify.

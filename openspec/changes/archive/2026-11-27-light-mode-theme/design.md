# Design

## Context

See [proposal.md](proposal.md) for motivation and scope. Currently, `web/index.html` hardcodes `<html lang="en" class="dark">` and `<body class="bg-slate-950 text-slate-100 antialiased">`, `web/src/index.css` declares `:root { color-scheme: dark; }` and dark-only `.help-prose` rules, and all 18 React UI files under `web/src/` use dark-only Tailwind slate/indigo/status utility classes. On the backend, `users` (`internal/db/migrations/001_initial.sql`) stores `id`, `email`, `password_hash`, `role`, `oidc_issuer`, `oidc_subject`, `created_at`, and `updated_at`, with no user-preference columns.

The marketing site (`itemizedapp.com`) defines its light/dark palette via CSS custom properties (`--it-*`), with light mode grounded in Tailwind Slate (`#f8fafc` canvas, `#ffffff` surfaces, `#f1f5f9` sunken tracks, `#e2e8f0`/`#cbd5e1` borders, `#0f172a`/`#334155`/`#475569`/`#64748b` text) and Indigo (`#4f46e5` accent, `#4338ca` hover/accent-text, `#eef2ff` soft accent bg, `#3730a3` soft accent text) plus Amber warning tokens (`#fffbeb`, `#fde68a`, `#92400e`).

## Goals / Non-Goals

**Goals:**
- Provide a first-class light mode that faithfully matches `itemizedapp.com`'s light palette while keeping the existing dark mode visually intact.
- Persist each user's theme preference (`system` | `light` | `dark`, default `system`) in SQLite and sync it across sessions/devices via the existing `/api/auth/*` endpoints.
- Switch themes instantaneously with zero flash of wrong theme (FOUT) on page load, reactive OS theme tracking in `system` mode, and synchronized `color-scheme` and `<meta name="theme-color">`.
- Standardize freezer `Snowflake` icons to match the location pin icon color (`text-slate-400 dark:text-slate-500`, or `text-indigo-600 dark:text-indigo-400` when selected) in location lists/trees and inherit the label font color in `Create Freezer` and `Freezer` pill badges.

**Non-Goals:**
- Custom user-defined color palettes or accent color pickers beyond `System` / `Light` / `Dark`.
- Redesigning layout geometry, typography scale, or component structure.
- Persisting theme changes to the server in demo mode (demo mode intentionally blocks account writes and resets hourly; local browser preview is sufficient).

## Decisions

### 1. User Profile Storage & API Contract
- **Decision**: Add `theme TEXT NOT NULL DEFAULT 'system' CHECK (theme IN ('system', 'light', 'dark'))` to `users` in `internal/db/migrations/003_user_theme.sql`. Expose `Theme string` (`json:"theme"`) on `auth.User`, update all `users` `SELECT` queries in `internal/auth/auth.go` to scan `theme`, and extend `PATCH /api/auth/account` (`handleUpdateAccount` / `Service.UpdateAccount`) to accept an optional `theme` string.
- **Rationale**: `PATCH /api/auth/account` already owns user self-service profile updates and already treats `email` and `new_password` as optional. Reusing it avoids proliferating endpoints and keeps `User` as the single source of truth returned by `/api/auth/status` and `/api/auth/me`.
- **Alternatives considered**:
  - Separate `PATCH /api/auth/preferences` endpoint: Unnecessary extra endpoint for a single user column; `PATCH /api/auth/account` already returns `{"user": updated}`.
  - Generic `preferences_json` column: Over-engineered for a single constrained enum; a `CHECK`-constrained `theme` column is explicit, self-documenting, and SQLite-native.

### 2. Tailwind CSS v4 Class-Based Dark Mode & Token Mapping
- **Decision**: Add `@custom-variant dark (&:where(.dark, .dark *));` in `web/src/index.css` and toggle `.dark` on `document.documentElement`. In `@layer base`, set `:root { color-scheme: light; }` and `:root.dark { color-scheme: dark; }`.
- **Token mapping (Light → Dark)** derived directly from `itemizedapp.com`:
  | Role | Light (`itemizedapp.com`) | Dark (existing app) |
  | --- | --- | --- |
  | App canvas (`body`, shell, auth bg) | `bg-slate-50` (`#f8fafc`) | `dark:bg-slate-950` |
  | Surface / Sidebar / Header / Cards / Modals | `bg-white` (`#ffffff`) | `dark:bg-slate-900` / `dark:bg-slate-900/60` |
  | Sunken tracks / Table header / Code bg | `bg-slate-100` (`#f1f5f9`) | `dark:bg-slate-950` / `dark:bg-slate-800` |
  | Interactive hover surface / Secondary button | `bg-slate-100` / `hover:bg-slate-100` | `dark:bg-slate-800` / `dark:hover:bg-slate-800` |
  | Subtle border / Dividers | `border-slate-200` (`#e2e8f0`) | `dark:border-slate-800` |
  | Strong border / Inputs | `border-slate-300` (`#cbd5e1`) | `dark:border-slate-700` |
  | Strong text (headings, primary values) | `text-slate-900` (`#0f172a`) | `dark:text-white` / `dark:text-slate-100` |
  | Body text | `text-slate-700` (`#334155`) | `dark:text-slate-200` / `dark:text-slate-300` |
  | Muted / secondary text | `text-slate-600` (`#475569`) | `dark:text-slate-400` |
  | Faint / placeholder / icon muted | `text-slate-500` (`#64748b`) | `dark:text-slate-500` |
  | Primary button | `bg-indigo-600 text-white hover:bg-indigo-700` | `dark:hover:bg-indigo-500` |
  | Accent link / text | `text-indigo-700 hover:text-indigo-800` | `dark:text-indigo-300 dark:hover:text-indigo-200` |
  | Soft accent highlight (active nav, pills) | `bg-indigo-50 text-indigo-800` | `dark:bg-indigo-600/20 dark:text-indigo-300` |
  | Warning / Demo / Due-soon banner | `border-amber-200 bg-amber-50 text-amber-900` | `dark:border-amber-500/40 dark:bg-amber-500/15 dark:text-amber-200` |
  | Success banner / badge | `border-emerald-200 bg-emerald-50 text-emerald-800` | `dark:border-emerald-500/40 dark:bg-emerald-500/15 dark:text-emerald-200` |
  | Danger / Overdue banner / badge | `border-rose-200 bg-rose-50 text-rose-800` | `dark:border-rose-500/40 dark:bg-rose-500/15 dark:text-rose-200` |
  | Modal backdrop | `bg-slate-950/50` | `dark:bg-black/70` |
  | `.help-prose` | Light tokens (`#0f172a`, `#334155`, `#4338ca`, `#f1f5f9`, `#e2e8f0`) | `.dark .help-prose` preserves existing dark values |
- **Rationale**: Using Tailwind's native light-first + `dark:` utilities keeps every component idiomatic, zero-runtime-overhead, and preserves existing dark class assertions (such as `Layout.test.tsx` checking `bg-slate-900` on the solid non-blurred header).
- **Alternatives considered**:
  - Rewriting all components to custom CSS classes backed by `--it-*` variables: High churn and fights Tailwind's utility-first architecture already used across the codebase.

### 3. Client Theme State, FOUT Prevention, and Demo Mode
- **Decision**:
  - Add a tiny synchronous inline `<script>` in `web/index.html` `<head>` (before stylesheets/body paint) that reads `localStorage.getItem("itemized_theme")` (default `"system"`), resolves effective theme via `window.matchMedia("(prefers-color-scheme: dark)").matches` when `"system"`, toggles `document.documentElement.classList.toggle("dark", isDark)`, and sets `<meta name="theme-color">` to `#0f172a` (dark) or `#ffffff` (light).
  - Create `web/src/components/ThemeContext.tsx` providing `{ preference, resolvedTheme, setPreference }` and syncing with `authStatus.user?.theme` when authenticated (updating `localStorage` so the next hard reload has zero FOUT) and listening to `matchMedia` `change` events whenever `preference === "system"`.
  - In `SettingsPage.tsx`, render an **Appearance** card (accessible to all authenticated users, `member` and `admin`) with a 3-option segmented control (`System`, `Light`, `Dark`) using `lucide-react` icons (`Monitor`, `Sun`, `Moon`). Clicking an option immediately updates `ThemeContext` (optimistic UI + `localStorage`) and, when `!demoMode`, sends `PATCH /api/auth/account` with `{ theme }` and updates the `["auth-status"]` query cache. On API error, roll back to the previous theme and surface the error banner. In demo mode, apply locally without calling `PATCH /api/auth/account`.
- **Rationale**: Immediate-save segmented control is standard UX for theme switching, avoids forcing users to click "Update Account" on an email/password form, and lets demo-mode visitors freely test light and dark mode.

### 4. Freezer Icon Color
- **Decision**:
  - In `Layout.tsx` (sidebar Locations tree) and `HierarchySelect.tsx` (search and drill-down option rows), match the `MapPin` location icon color: `isSelected ? "text-indigo-600 dark:text-indigo-400" : "text-slate-400 dark:text-slate-500"`.
  - In `TaxonomyPages.tsx` (`/locations` list) and `QrActionPage.tsx` (sub-location chips), use the same muted location icon color `text-slate-400 dark:text-slate-500`.
  - In `HierarchySelect.tsx` (inline `Create Freezer` button) and `QrActionPage.tsx` (`Freezer` pill badge), omit any explicit `text-*` color class on `<Snowflake>` so it inherits the button/badge font color (`currentColor`). Keep indigo soft-accent styling on the `Create Freezer` button, `Freezer` pill badge, and `Freezer location` subtitle for balanced contrast in light and dark modes.

## Risks / Trade-offs

- **[Risk] Missed dark-only classes leaving unreadable white-on-white text in light mode** → **Mitigation**: Systematically audit all 18 styled `.tsx` files and `index.css` (grep for `text-white`, `bg-slate-9`, `bg-slate-8`, `border-slate-`, `text-slate-` without a light counterpart) and verify contrast across key screens (Inventory, Product Detail, Forms, Scanner Drawer, Settings, Auth, Help, QR Action).
- **[Risk] Existing tests asserting dark-specific CSS rules (`pwa.test.ts`, `Layout.test.tsx`)** → **Mitigation**: Preserve `color-scheme: dark` in `@layer base` (under `:root.dark`) and keep `dark:bg-slate-900` on `<header>` without `backdrop-blur`; update `pwa.test.ts` to assert both `color-scheme: light` and `color-scheme: dark` and add dedicated theme-switching tests.
- **[Risk] `itemized.db` / existing deployments lacking `theme` column** → **Mitigation**: Embedded migration `003_user_theme.sql` uses `ALTER TABLE users ADD COLUMN theme TEXT NOT NULL DEFAULT 'system' CHECK (theme IN ('system', 'light', 'dark'))`, which SQLite executes in place without rewriting existing rows.

## Migration Plan

1. Run embedded migration `003_user_theme.sql` automatically on server startup via `db.Open` / `db.Migrate`.
2. Existing users automatically receive `theme = 'system'`.
3. Rollback: If reverting the binary, SQLite tolerates an unused column if queries list columns explicitly; no destructive migration steps are required.

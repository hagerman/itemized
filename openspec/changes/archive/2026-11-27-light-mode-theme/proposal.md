# Proposal

## Why

The marketing website (`itemizedapp.com`) supports both a crisp light color scheme and a dark color scheme, while the web application currently renders exclusively in dark mode. Adding the matching light mode palette with a profile-backed theme preference (`System`, `Light`, `Dark`) lets household members use the app comfortably in bright environments or match their OS appearance automatically, while aligning the freezer snowflake icon with the surrounding location icon and button text colors improves visual cohesion across both themes.

## What Changes

- **User profile theme preference (`user-auth`)**:
  - Add a `theme` column (`'system'`, `'light'`, `'dark'`, defaulting to `'system'`) to the `users` table via a SQLite migration.
  - Include `theme` in serialized `User` responses (`/api/auth/status`, `/api/auth/me`, `/api/auth/login`, `/api/auth/setup`, `/api/auth/account`, `/api/users`).
  - Allow authenticated users to update their `theme` preference via `PATCH /api/auth/account` (independently of email or password changes), validating allowed values and rejecting invalid values with HTTP 422.
- **Light mode and theme switching (`web-ui`)**:
  - Apply the `itemizedapp.com` light mode color scheme across all application surfaces, navigation, modals, drawers, forms, tables, cards, auth screens, and help prose when light mode is active, while preserving the existing dark mode palette when dark mode is active.
  - Configure class-based dark mode in Tailwind CSS v4 (`@custom-variant dark`) with dynamic root `color-scheme` (`light` vs `dark`), dynamic `<meta name="theme-color">` (`#ffffff` in light mode, `#0f172a` in dark mode), and a synchronous boot script in `index.html` using a `localStorage` cache to prevent flash of wrong theme on initial load.
  - Default theme resolution to `system` (following `prefers-color-scheme: dark` reactively via `matchMedia`), and expose a `System` / `Light` / `Dark` selector in User Settings (visible to both `member` and `admin` users) that immediately applies the selection and persists it to the user's profile (falling back to local browser preview in demo mode where account mutations are disabled).
- **Freezer icon color alignment (`web-ui`)**:
  - Update the freezer `Snowflake` icon across location lists and trees (sidebar location tree, `HierarchySelect` options, `LocationsPage`, and `QrActionPage` sub-location chips) from sky blue (`text-sky-400`) to match the muted location pin icon color (`text-slate-400 dark:text-slate-500`, and `text-indigo-600 dark:text-indigo-400` when selected).
  - On the inline `Create Freezer` action in `HierarchySelect` (and the `Freezer` pill badge in `QrActionPage`), let the snowflake icon inherit the button/badge font color (`currentColor`) so it blends cleanly with the label text in both light and dark modes.

## Capabilities

### New Capabilities
<!-- None; this change extends existing user-auth and web-ui capabilities. -->

### Modified Capabilities
- `user-auth`: Add per-user `theme` preference storage (`system` | `light` | `dark`, defaulting to `system`) on user profiles, expose it in user API payloads, and allow users to update it via `PATCH /api/auth/account`.
- `web-ui`: Add light mode matching the `itemizedapp.com` light palette, user-selectable `System` / `Light` / `Dark` theme mode in Settings backed by the user's profile, dynamic `color-scheme` and `theme-color` handling, and location-icon/font-matched styling for the freezer icon across the app.

## Impact

- **Database**: New embedded migration `internal/db/migrations/003_user_theme.sql` adding `theme TEXT NOT NULL DEFAULT 'system' CHECK (theme IN ('system', 'light', 'dark'))` to `users`.
- **Backend (`internal/auth`, `internal/api`)**: Update `auth.User`, user `SELECT` queries, `UpdateAccount`, and `handleUpdateAccount` to read, validate, and persist `theme`.
- **Frontend (`web/`)**:
  - `web/index.html`, `web/src/index.css`: Tailwind v4 `@custom-variant dark`, semantic light/dark CSS tokens and `.help-prose` theme variants, dynamic `color-scheme`, and anti-FOUT boot script.
  - New `web/src/components/ThemeContext.tsx` (or theme helper module) integrated in `web/src/App.tsx` and `web/src/pages/SettingsPage.tsx`.
  - Light/dark styling updates across `web/src/components/*` and `web/src/pages/*` (18 files).
  - Freezer icon color update in `web/src/components/Layout.tsx`, `web/src/components/HierarchySelect.tsx`, `web/src/pages/TaxonomyPages.tsx`, and `web/src/pages/QrActionPage.tsx`.
- **Tests**: Go unit/API tests (`internal/auth/auth_test.go`, `internal/api/api_test.go`), Vitest frontend tests (`web/src/pwa.test.ts`, `web/src/pages/SettingsPage.test.tsx`, `web/src/components/Layout.test.tsx`, new theme unit tests), and existing docs/a11y checks.

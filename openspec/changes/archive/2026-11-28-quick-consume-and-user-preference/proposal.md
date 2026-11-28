# Proposal

## Why

Household members who don't want to learn the Scan Drawer or click into individual product detail pages often skip logging consumed items, causing inventory counts to drift. At the same time, power users—especially those printing per-item QR labels—want to avoid accidentally marking the wrong physical unit consumed from a product list.

## What Changes

- **Quick-consume API endpoint**: Add `POST /api/products/{id}/consume-next` to atomically consume the next-due unconsumed item for a product (following existing FEFO ordering: soonest `due_on_date`, unset last, ties by oldest `id`) and return `{ item, previous }` so the UI can offer a 1-tap Undo.
- **Per-user quick-actions preference**: Add a persisted `quick_actions_enabled` boolean on user accounts (migration `004_user_quick_actions.sql`, defaulting to `true` for all existing and newly created users), serialized on user API responses and updatable via `PATCH /api/auth/account`.
- **Quick `Consume` action on inventory list**: When the signed-in user has `quick_actions_enabled` enabled and a product has `in_stock_count > 0`, render an explicit `Consume` button on mobile product cards (in the bottom row) and in a dedicated trailing action column on desktop table rows (keeping the `Stock` column clean and stopping row/card navigation), triggering `POST /api/products/{id}/consume-next`, refreshing counts/lists, and displaying a bottom Undo toast (`PATCH /api/items/{id}` with `{ consumed_on_date: null }`).
- **Cohesive `Quick Actions` preference in Settings**: Add a **Quick Actions** section in Settings (matching the **Appearance** heading, description, and `Enabled | Disabled` segmented control pattern, accessible to all roles, with a short note for label-printing power users) that persists via `PATCH /api/auth/account` (and toggles locally in demo mode).

## Capabilities

### New Capabilities

<!-- None: all behaviors extend existing capabilities. -->

### Modified Capabilities

- `inventory-catalog`: Add `POST /api/products/{id}/consume-next` to consume the soonest-due unconsumed item of a product and return the consumed item and its prior state for undo.
- `user-auth`: Add per-user `quick_actions_enabled` preference (default `true`) persisted on user records, exposed in serialized user responses, and updatable via `PATCH /api/auth/account`.
- `web-ui`: Add quick `-1` consume controls with an Undo toast on inventory list product cards and desktop rows (respecting the user's `quick_actions_enabled` preference), and add the corresponding toggle in Settings → Account.

## Impact

- **Database & Auth (`internal/db/`, `internal/auth/`)**: New migration `004_user_quick_actions.sql`; `User.QuickActionsEnabled` field and `UpdateAccount` support; Go auth/db tests.
- **API (`internal/api/`, `docs/api.md`)**: New `POST /api/products/{id}/consume-next` handler, `PATCH /api/auth/account` `quick_actions_enabled` field, Go tests, and verified API doc example.
- **Frontend (`web/src/`)**:
  - `web/src/api.ts`: `quick_actions_enabled` on `User` interface.
  - `web/src/pages/ProductsPage.tsx`: `-1` quick-consume buttons on mobile cards and desktop rows + Undo toast.
  - `web/src/pages/SettingsPage.tsx`: Quick Actions preference toggle in the Account card.
  - Vitest tests in `ProductsPage.test.tsx` and `SettingsPage.test.tsx`, plus `make build` and `make docs-build`.
- **Documentation (`docs/`)**: Update `docs/api.md`, `docs/use/inventory-and-expiration.md`, `docs/configure/settings.md`, and `docs/configure/accounts-and-sso.md` (and regenerate in-app Help via `make docs-build`).

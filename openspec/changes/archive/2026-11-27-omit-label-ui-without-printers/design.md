# Design

## Context

See `proposal.md` for motivation and scope. Currently, `GET /api/printers` is restricted to `admin` users (`adminOnly`), while both `admin` and `member` users interact with Products, Items, Locations, and the Purchase scanner drawer. Meanwhile, `GET /api/auth/status` already exposes instance capability flags (`oidc_enabled`, `oidc_force`, `llm_enabled`, `demo_mode`) to all authenticated users and is cached in React Query under `["auth-status"]`.

In standard mode, printers created through the Settings UI default to `enabled = true`, and server-side printing (`printToActivePrinters`) queries `listPrinters(ctx, true)` (`WHERE enabled = 1`). In demo mode, `internal/demo/seed.go` seeds a sample printer (`Kitchen Zebra ZSB`) with `enabled = 0` so visitors can inspect printer features while outbound network connections remain sandboxed.

## Goals / Non-Goals

**Goals:**
- Provide a single, low-overhead source of truth (`printers_enabled` on `GET /api/auth/status`) accessible to both `admin` and `member` users.
- Omit every print-label action button and label-print-mode display/input outside Settings when `printers_enabled` is `false`, while keeping responsive grids balanced.
- Immediately reflect printer additions and deletions made in Settings without a full page reload.
- Preserve existing `label_print_mode` data on products and purchases when the selector is hidden.

**Non-Goals:**
- Hiding the admin-only `Label Printers` or `ZPL Label Templates` sections in Settings (admins still need Settings to configure their first printer).
- Disabling or removing backend `POST /api/*/print-label` endpoints or changing the `products.label_print_mode` database column.
- Adding an enable/disable toggle to the Settings printer UI.

## Decisions

### 1. Expose `printers_enabled` via `GET /api/auth/status`
- **Decision**: Add `printers_enabled: boolean` to the JSON payload returned by `handleAuthStatus` in `internal/api/server.go` and to the `AuthStatus` interface in `web/src/api.ts`.
- **Rationale**: Mirrors the existing `llm_enabled` pattern already consumed by `ProductsPage.tsx`. Works for both `admin` and `member` roles without weakening `/api/printers` admin-only access control or adding extra network calls on every page.
- **Alternatives considered**:
  - Allowing `member` users to call `GET /api/printers`: leaks internal network endpoints/IPs to non-admin users and conflicts with the existing `label-printing` RBAC requirement (`HTTP 403` for non-admin `/api/printers`).
  - Adding a separate `/api/printers/status` endpoint: adds an extra request and cache key for a single boolean that belongs alongside `llm_enabled` in `/api/auth/status`.

### 2. Query semantics for `printers_enabled` (standard vs. demo mode)
- **Decision**: Add a helper `s.hasPrinters(ctx context.Context) (bool, error)` on `Server`:
  - In standard mode (`!s.DemoMode`): `SELECT COUNT(1) FROM printers WHERE enabled = 1` > 0 (matching `printToActivePrinters`).
  - In demo mode (`s.DemoMode`): `SELECT COUNT(1) FROM printers` > 0, so the seeded disabled sample printer (`Kitchen Zebra ZSB`) keeps label UI visible for demo visitors, while deleting all printers in demo mode flips `printers_enabled` to `false`.
- **Rationale**: In standard mode, if all configured printers are disabled via API, printing is a no-op anyway. In demo mode, the seeded printer is intentionally `enabled = 0` for sandboxing, so counting all rows preserves the demo showcase.

### 3. Shared frontend query access and Settings invalidation
- **Decision**: Read `["auth-status"]` via React Query (a small shared hook, e.g., `usePrintersEnabled()` in `web/src/api.ts`, wrapping `useQuery({ queryKey: ["auth-status"], queryFn: () => apiFetch<AuthStatus>("/api/auth/status") })` and returning `Boolean(data?.printers_enabled)`). In `SettingsPage.tsx`, call `void qc.invalidateQueries({ queryKey: ["auth-status"] })` after adding or deleting a printer alongside `["printers"]`.
- **Rationale**: Avoids prop-drilling `printersEnabled` through `App.tsx`, `Layout.tsx`, and every route component; shares the single React Query cache entry already populated at app startup; defaults to `false` safely when unpopulated.
- **Alternatives considered**:
  - Passing `printersEnabled` as props from `App.tsx` through `Layout` and route elements: noisier across routes and components (including `ScannerDrawer` inside `Layout`) and harder to test in isolation.

### 4. Responsive grid adjustments when controls are omitted
- **Decision**:
  - `ProductDetailPage.tsx`:
    - Header: conditionally render the `Print Product Label` button; remaining buttons stay right-aligned in the existing flex row.
    - Metadata summary: compute visible tile count (`3` base tiles + `1` if `printersEnabled` + `1` if `productMeas`) and map cleanly to `sm:grid-cols-3`, `sm:grid-cols-4`, or `sm:grid-cols-5`.
    - Bulk actions bar: conditionally render `Reprint Labels`.
    - Mobile item cards: switch button row from `grid-cols-3` to `grid-cols-2` when `!printersEnabled` and omit `Print`.
    - Desktop item table: omit `Print` button in Actions column.
  - `ProductFormPage.tsx`:
    - Conditionally render the `Label Print Mode` `<label>`/`<select>`; adjust wrapper grid (`sm:grid-cols-2` when `printersEnabled`, `grid-cols-1` when omitted) so `Minimum Stock` doesn't leave an awkward half-width blank column.
    - Still include `label_print_mode: printMode` in the submit payload so existing products retain their value on edit and new products default to `"per_item"`.
  - `TaxonomyPages.tsx`:
    - `LocationsPage`: omit the per-row `Print location label` icon button when `!printersEnabled`.
    - `LocationDetailPage`: omit the `Print Location Label` header button when `!printersEnabled`.
  - `ScannerDrawer.tsx`:
    - Conditionally render the Purchase `Label Mode` `<label>`/`<select>` and switch the grid from `sm:grid-cols-4` to `sm:grid-cols-3` when `!printersEnabled`.
    - Still send `label_print_mode: purchasePrintMode` on purchase submit.

## Risks / Trade-offs

- **Existing frontend unit tests do not mock `/api/auth/status`** → Tests for `ProductDetailPage`, `ProductFormPage`, `TaxonomyPages`, and `ScannerDrawer` that assert on `Print Label`, `Reprint Labels`, `Print`, or `Label Mode` will see `printersEnabled === false` unless their fetch mocks return `/api/auth/status` with `printers_enabled: true`. Mitigation: update existing printer-UI assertions in those test files to mock `printers_enabled: true` and add dedicated test cases verifying omission when `printers_enabled: false`.
- **Stale `auth-status` in another browser tab** → If an admin adds a printer in one tab while another user has an open session, React Query's `staleTime` (15s) and window-focus refetch will pick up the change naturally; in the same tab, Settings invalidates `["auth-status"]` immediately.

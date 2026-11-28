# Design

## Context

See `proposal.md` for motivation and scope.

Current architecture constraints:
- **Database & Auth**: Per-user preferences follow the pattern established by `003_user_theme.sql` (`users` table column with default + CHECK constraint, `auth.User` field, `auth.Service.UpdateAccount`, and `PATCH /api/auth/account` in `internal/api/server.go`).
- **Consume & Undo**: `POST /api/items/{id}/consume` in `internal/api/items.go` sets `consumed_on_date` to today (UTC) and returns `{ item, previous }`. `ScannerDrawer.tsx` already uses `PATCH /api/items/{id}` with `{ consumed_on_date: null }` for Undo toasts.
- **Inventory List**: `ProductsPage.tsx` renders mobile cards (`<Link>` wrapping each card) and desktop table rows (`<tr onClick={...}>` with `stopPropagation` on checkbox cells), and reads `authStatus` via `["auth-status"]`.

## Goals / Non-Goals

**Goals:**
- Provide 1-tap `-1` consumption on the inventory list with deterministic FEFO item selection and immediate Undo.
- Allow each household user to independently enable/disable quick actions from their own Account settings (defaulting to enabled for low-friction household adoption).
- Keep the mobile card and desktop table interactions clean without accidental navigation to `/products/:id`.

**Non-Goals:**
- Quick `+1` purchase or quick open/transfer actions on product cards (only `-1` consume is in scope).
- Instance-wide admin enforcement of quick actions (this is a per-user preference so household members can keep `-1` while a label-printing admin turns it off).
- Selecting a specific variant/location from a modal on quick consume (clicking into `/products/:id` or using Scan / Action already serves that flow).

## Decisions

### 1. Dedicated `POST /api/products/{id}/consume-next` Endpoint
- **Choice**: Add `POST /api/products/{id}/consume-next` in `internal/api/items.go` (registered on `authed` mux in `internal/api/server.go`) rather than exposing `next_item_id` on `GET /api/products` and calling `POST /api/items/{id}/consume`.
- **Why**: Selecting and consuming the next-due item server-side in one request avoids stale-ID races when two household members tap `-1` concurrently (or when a user taps `-1` twice in quick succession).
- **Behavior**: Verify product exists (`404` if not), query the first unconsumed item ordered by `CASE WHEN due_on_date IS NULL THEN 1 ELSE 0 END, due_on_date ASC, id ASC LIMIT 1` (`409` if none), mark it consumed, and return HTTP 200 `{ "item": updated, "previous": prev }`.

### 2. Per-User Column `quick_actions_enabled` via `004_user_quick_actions.sql`
- **Choice**: Add `quick_actions_enabled INTEGER NOT NULL DEFAULT 1 CHECK (quick_actions_enabled IN (0, 1))` to `users`, mapped to `bool` (`QuickActionsEnabled`) on `auth.User`, and accept optional `quick_actions_enabled *bool` on `PATCH /api/auth/account`.
- **Why**: Mirrors `003_user_theme.sql` cleanly, requires zero new tables, works seamlessly across sessions/devices for the same user, and defaults existing and new accounts to `true`.

### 3. Card, Table, and Settings UI Cohesion
- **Choice**:
  - **Mobile cards (`<Link to={...}>`)**: Keep `{p.in_stock_count} in stock` clean in the top-right. Place an explicit `Consume` button (with a subtle icon) right-aligned in the card's bottom row with `onClick={(e) => { e.preventDefault(); e.stopPropagation(); void handleQuickConsume(p); }}`, disabled while in flight.
  - **Desktop table rows**: Keep the `Stock` column count-only so numeric badges stay scannable. When `quickActionsEnabled` is `true`, render a dedicated trailing action column containing an explicit `Consume` button on in-stock rows (with `e.stopPropagation()` so row navigation never fires). Omit the trailing column completely when `quickActionsEnabled` is `false`.
  - **Settings UI**: Style `Quick Actions` to match `Appearance` directly above it: bold `text-base font-semibold` heading, concise muted description underneath, and a matching `Enabled | Disabled` segmented control (`role="radiogroup"`) on the right.
  - Render a single floating Undo toast at the bottom of `ProductsPage` (auto-dismissing after ~8s, cleared/replaced on subsequent consumes, with `Undo` calling `PATCH /api/items/{id}` with `{ consumed_on_date: null }`).
- **Default fallback**: Treat `authStatus?.user?.quick_actions_enabled !== false` as enabled so partial test mocks that omit the field remain backwards-compatible while explicit `false` hides the buttons.

## Risks / Trade-offs

- **Accidental `-1` tap on mobile**: Mitigated by a prominent bottom Undo toast naming the consumed product and location, plus the per-user preference to disable quick actions entirely.
- **API doc contract verification (`internal/docsverify/api_docs_test.go`)**: Adding `POST /api/products/{id}/consume-next` requires a verified example in `docs/api.md` and `make docs-build` so `make check` stays green.

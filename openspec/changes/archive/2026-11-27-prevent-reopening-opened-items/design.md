# Design

## Context

See `proposal.md` for motivation and scope.

Currently:
- `internal/api/items.go`: `handleConsumeItem` checks `prev.ConsumedOnDate != nil` and returns HTTP 200 with `already_consumed: true` without mutating the row, whereas `handleOpenItem` unconditionally overwrites `opened_on_date` and `due_on_date`. Similarly, `handleBulkItems` guards `"consume"` with `AND consumed_on_date IS NULL` but has no `opened_on_date` guard on `"open"`.
- `web/src/pages/ProductDetailPage.tsx`: Both mobile item cards and desktop table rows unconditionally render an `Open` button, and the bulk item actions bar unconditionally renders `Open`. (By contrast, `QrActionPage.tsx` already omits `Open` when `opened_on_date` is set.)
- `web/src/components/ScannerDrawer.tsx`: `handleConsumeOpenScan` checks `res.item.consumed_on_date` for already-consumed items, but has no check for `action === "open" && res.item.opened_on_date`, and candidate loading (`handleConsumeOpenScan`, `loadProductCandidates`, `associateUnknownBarcode`) includes already-opened items when `mode === "open"`.

## Goals / Non-Goals

**Goals:**
- Prevent re-opening already-opened items consistently across the Go API, Product Detail UI, and Scan / Action drawer.
- Match the existing `already_consumed` API and scanner UX patterns so behavior is predictable and idiomatic.

**Non-Goals:**
- Adding an "Unopen" button or changing `PATCH /api/items/:id` (which remains available for undo toasts and direct date edits).
- Modifying `QrActionPage.tsx`, which already hides `Open` when `opened_on_date` is set.

## Decisions

### 1. Return HTTP 200 with `already_opened: true` on `POST /api/items/:id/open`
- **Decision**: When `prev.OpenedOnDate != nil`, `handleOpenItem` returns HTTP 200 with `{ "item": prev, "previous": prev, "already_opened": true, "print_warnings": null }` without updating the database or printing labels. On a fresh open, it includes `"already_opened": false`.
- **Rationale**: Mirrors `handleConsumeItem`'s `already_consumed` contract directly and preserves compatibility with existing API tests (including `TestDueDateAutoReprint` which calls `/open` twice and asserts 0 reprints).
- **Alternative considered**: Returning HTTP 409 Conflict. Rejected because `handleConsumeItem` intentionally uses HTTP 200 + `already_consumed: true` so idempotent callers don't fail unexpectedly while UI callers can still detect and surface the already-opened state.

### 2. Skip already-opened (and already-consumed) items in `POST /api/items/bulk` (`action: "open"`)
- **Decision**: In `handleBulkItems` `case "open"`, skip any item where `prev.OpenedOnDate != nil || prev.ConsumedOnDate != nil` before updating, so `processed` reflects only newly opened items and existing dates/labels are untouched.
- **Rationale**: Matches `case "consume"` (`AND consumed_on_date IS NULL`) and safely handles mixed selections (some opened, some unopened) from the Product Detail bulk bar.

### 3. Omit per-item and bulk `Open` buttons in `ProductDetailPage.tsx`
- **Decision**:
  - Desktop table row: render `Open` only when `!it.opened_on_date`.
  - Mobile item card: render `Open` only when `!it.opened_on_date`, and compute the action grid class from the number of visible buttons (`grid-cols-1`, `grid-cols-2`, or `grid-cols-3`) so buttons fill the row evenly.
  - Bulk action bar: render `Open` only when `selectedIds.some(id => !itemsById[id]?.opened_on_date)` (i.e. at least one selected item is unopened).
- **Rationale**: Keeps the UI clean without disabled dead buttons, matching `QrActionPage.tsx` and the existing `printersEnabled` conditional rendering pattern.

### 4. Filter and report already-opened items in `ScannerDrawer.tsx` (`Open` mode)
- **Decision**:
  - Item scan (`res.kind === "item"`): when `action === "open" && res.item.opened_on_date`, clear any undo toast and call `setErrorMsg(`${itemName} was already opened (${res.item.opened_on_date}).`)` without calling `POST /api/items/:id/open`. Also check `resp.already_opened` after `POST /api/items/:id/open` to handle concurrent opens gracefully.
  - Candidate lists (`product`, `barcode`, `location` scans, `loadProductCandidates`, and `associateUnknownBarcode` when `mode === "open"`): filter `items` to `items.filter(it => !it.opened_on_date)`. If `items.length > 0` and `unopened.length === 0`, clear candidate state and display an error via `setErrorMsg` (e.g., `${productName} is already opened.` or `All in-stock items of ${productName} are already opened.` for multi-item products; `All in-stock items are already opened.` for locations).
- **Rationale**: Covers both direct item QR scans and product/UPC/search workflows in `Open` mode, ensuring users get clear feedback instead of silently overwriting dates or seeing un-openable items.

## Risks / Trade-offs

- **Concurrent open race** → Mitigated by checking both `res.item.opened_on_date` on the client before calling `/open` and `resp.already_opened` in the API response, backed by the server-side `prev.OpenedOnDate != nil` guard.
- **Mixed bulk selection feedback** → When a user selects both opened and unopened items on Product Detail and clicks bulk `Open`, the backend skips already-opened items without erroring; `processed` accurately reflects the count opened.

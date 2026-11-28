# Proposal

## Why

Legacy imports preserved per-item `notes`, but the product detail UI (`/products/:id`) neither displays item notes nor lets users add, edit, or clear them. In addition, `/products/:id` crashes with `TypeError: can't access property "map", ee.barcodes is undefined` whenever a product has any variant with zero barcodes because `Variant.Barcodes` in Go is tagged with `json:"barcodes,omitempty"` (which omits empty slices from JSON) and `ProductDetailPage.tsx` calls `v.barcodes.map(...)` unguarded.

## What Changes

- **Fix variant `barcodes` JSON serialization & frontend resilience**:
  - Remove `omitempty` from `Variant.Barcodes` (`json:"barcodes"`) in `internal/api/catalog.go` and ensure `Barcodes` is always initialized to `[]Barcode{}` so `GET /api/products/:id` and variant endpoints always return `"barcodes": []` instead of omitting the field.
  - Guard `v.barcodes` in `web/src/pages/ProductDetailPage.tsx` (`(v.barcodes ?? []).map(...)`) so partial or legacy payloads never throw.
- **Normalize item notes on update**:
  - Ensure `PATCH /api/items/:id` trims leading/trailing whitespace on `notes` and stores `NULL` when the trimmed string is empty (consistent with explicit `null` or `""`).
- **Display and inline-edit item notes on `/products/:id`**:
  - Show each item's `notes` in both the mobile stacked card view and the desktop table view under `Items in Stock` without introducing horizontal scrolling on mobile.
  - Provide an inline note editor (Add / Edit / Clear note, Save / Cancel) per item on both mobile and desktop that persists changes via `PATCH /api/items/:id` and refreshes inventory queries.
- **Allow inline note editing on `/go/i/:id`**:
  - Extend the Item Quick Action screen (`QrActionPage.tsx`), which already displays `item.notes`, with a compact inline editor to add, update, or clear notes via `PATCH /api/items/:id`.

## Capabilities

### New Capabilities

<!-- None: all changes extend existing capabilities -->

### Modified Capabilities

- `inventory-catalog`: Require `Variant` API responses to always serialize `barcodes` as a JSON array (`[]` when empty) and require `PATCH /api/items/:id` to trim whitespace on `notes` (clearing to `null` when empty/whitespace-only).
- `product-detail-responsive-ui`: Require `/products/:id` to display item notes and support inline adding, editing, and clearing of notes in both mobile cards and desktop table rows, and to safely render variants with empty or omitted `barcodes`.
- `qr-quick-action`: Allow adding, editing, and clearing item notes inline on `/go/i/:id`.

## Impact

- **Backend**: `internal/api/catalog.go` (`Variant` struct tag and variant responses), `internal/api/items.go` (`handleUpdateItem` note trimming), `internal/api/api_test.go` (regression tests).
- **Frontend**: `web/src/pages/ProductDetailPage.tsx`, `web/src/pages/QrActionPage.tsx`, `web/src/pages/ProductDetailPage.test.tsx`, `web/src/pages/QrActionPage.test.tsx`.
- **Database / Migrations**: None (`items.notes` column already exists in SQLite schema and is already returned by item APIs).

# Proposal

## Why

Over time, purchasing similar items creates duplicate or near-duplicate product entries in the inventory catalog. Users need a safe, streamlined way to consolidate multiple products into a single destination entry without losing existing variants, retail barcodes, item history, or breaking previously printed product QR codes and legacy UUIDs.

## What Changes

- Add a product merge API endpoint (`POST /api/products/merge`) that atomically moves all variants (with their retail barcodes) and all items (both unconsumed and consumed) from one or more source products into a chosen destination product, deletes the merged source products, and persists merge-link aliases mapping each merged product's integer ID and optional `legacy_uuid` to the destination product.
- Repoint existing merge-link aliases during chained merges (if Product A was merged into B, and B is later merged into C, A's alias is updated to point to C) and prevent SQLite from reusing deleted merged product IDs on future product inserts.
- Update product QR redirect (`GET /go/p/{id}`) and unified scan resolution (`POST /api/scan/resolve`) to follow merged product aliases when an old product integer ID or legacy UUID is scanned, so every scanner workflow (`Purchase`, `Consume`, `Open`, `Transfer`, `Inventory`) and browser QR redirect transparently targets the destination product.
- Add a desktop-only `Merge` bulk action to the Products list floating bulk actions bar (`ProductsPage`) that appears when at least two products are selected, opens a destination-selection modal dialog (supporting backdrop and `Escape` dismissal), and executes the merge before refreshing the list and sidebar counts. Search views (`Quick Search` and mobile `/search`) and mobile list views remain unchanged.

## Capabilities

### New Capabilities

### Modified Capabilities
- `inventory-catalog`: Add product consolidation (merging one or more source products into a destination product, transferring all variants and items, deleting source products, recording/repointing merge aliases, and preventing merged ID reuse).
- `barcode-scanning`: Follow merged product aliases in `GET /go/p/:id` and `POST /api/scan/resolve` for both integer IDs and legacy UUIDs so old product QR codes and bare legacy UUIDs resolve to the destination product.
- `web-ui`: Add the desktop-only `Merge` bulk action (visible when 2+ products are selected on the Products list) and destination-picker modal dialog (with backdrop dismissal) to the Products list view.

## Impact

- **Database**: New SQLite migration `internal/db/migrations/002_product_merges.sql` adding `product_merges` table with indexes on `target_product_id` and `source_legacy_uuid`.
- **Backend API**: New `POST /api/products/merge` handler in `internal/api/catalog.go`, route registration in `internal/api/server.go`, ID-reuse guard in `insertProduct`, and alias fallback in `handleQRProduct` (`internal/api/server.go`) and `resolveProductByToken` (`internal/api/workflows.go`).
- **Frontend**: Updated `web/src/pages/ProductsPage.tsx` (bulk `Merge` button when `>= 2` products selected, destination selection modal using `ModalBackdrop`), plus tests in `web/src/pages/ProductsPage.test.tsx` and `internal/api/api_test.go`.

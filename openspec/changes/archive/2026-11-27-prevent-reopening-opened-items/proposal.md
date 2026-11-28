# Proposal

## Why

Items that have already been marked opened still show an `Open` action button on the Product Detail page and can be opened a second time via the `Scan / Action` screen or API, which silently overwrites `opened_on_date` and can cause confusion. Preventing re-opening in the UI, scanner workflow, and backend API keeps item lifecycle state accurate and consistent with the existing already-consumed and QR quick-action behaviors.

## What Changes

- **Product Detail page (`/products/:id`)**:
  - Omit the per-item `Open` button on both desktop table rows and mobile item cards when `opened_on_date` is already set (adjusting mobile action row columns so remaining buttons stay balanced without empty slots).
  - Omit the bulk `Open` button in the bulk item actions bar when all selected items are already opened.
- **Scan / Action screen (`Open` mode)**:
  - When scanning an already-opened item QR (`/go/i/:id` or UUID), do not call the open endpoint or show an "Opened" undo toast; instead display an error message naming the item and its opened date (matching the existing already-consumed error pattern). Also handle `already_opened: true` returned from the API as a race-condition fallback.
  - When scanning a product QR, retail barcode, location QR, or searching by product name in `Open` mode, exclude already-opened items from the selectable candidate list; if in-stock items exist but all of them are already opened, display an error message stating they were already opened.
- **Backend API (`POST /api/items/:id/open` and `POST /api/items/bulk`)**:
  - Make `POST /api/items/:id/open` idempotent for already-opened items: when `opened_on_date` is already set, leave `opened_on_date` and `due_on_date` unchanged, skip label reprints, and return HTTP 200 with `"already_opened": true` (and `"already_opened": false` on a fresh open), mirroring `POST /api/items/:id/consume`.
  - Update `POST /api/items/bulk` (`action: "open"`) to skip items that already have `opened_on_date` (or `consumed_on_date`) set so mixed bulk selections only open unopened in-stock items.

## Capabilities

### New Capabilities

_(None — all changes refine existing capabilities.)_

### Modified Capabilities

- `inventory-catalog`: Prevent `POST /api/items/:id/open` and bulk `open` from overwriting `opened_on_date` / `due_on_date` on already-opened items, returning `already_opened: true` on single-item open.
- `product-detail-responsive-ui`: Omit per-item `Open` buttons (mobile cards and desktop table) for already-opened items and omit the bulk `Open` button when all selected items are already opened.
- `barcode-scanning`: Display an error in `Scan / Action` `Open` mode when scanning an already-opened item (or a product/barcode/location whose in-stock items are all already opened), and exclude already-opened items from `Open` mode candidate selection.

## Impact

- **Backend**: `internal/api/items.go` (`handleOpenItem`, `handleBulkItems`), `internal/api/api_test.go`.
- **Frontend**: `web/src/pages/ProductDetailPage.tsx`, `web/src/pages/ProductDetailPage.test.tsx`, `web/src/components/ScannerDrawer.tsx`, `web/src/components/Scanner.test.tsx`.
- **Compatibility**: Non-breaking; `POST /api/items/:id/open` continues to return HTTP 200 with `item` and `previous`, adding the `already_opened` boolean field.

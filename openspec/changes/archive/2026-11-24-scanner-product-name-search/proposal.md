# Proposal

## Why

In the `Scan & Action` modal (`ScannerDrawer`), `Purchase` mode lets users type a product name and pick from a clickable `Matching Products` list, whereas `Consume` and `Open` only show a dead-end message (`"Found N matching products; refine your search or scan a label."`) when multiple products match, and `Transfer` rejects typed product names altogether (`"Unrecognized barcode or QR code."`). Allowing users to search and pick matching in-stock products by name across `Consume`, `Open`, and `Transfer` brings parity with `Purchase` and makes label-less or keyboard-driven stock actions fast and consistent.

## What Changes

- Enable product-name text search in `Consume`, `Open`, and `Transfer` modes when the scanner input does not resolve to an item/product/location/barcode and is not a 6–14 digit retail barcode.
- Query in-stock products (`GET /api/products?status=in_stock&q=...`) and:
  - When multiple in-stock products match, render a clickable `Matching Products` list (up to 8 results, displaying product name and category hierarchy just like `Purchase` mode) so the user can pick the desired product and load its in-stock items for selection (`Apply consume` / `Apply open` / `Add to Transfer List`).
  - When exactly one in-stock product matches, immediately load its in-stock items into the candidate item list (matching existing single-match behavior in `Consume`/`Open` and extending it to `Transfer`).
  - When no in-stock products match, display a clear status message without opening a product-creation form.
- Clear transient product search results when a product is selected, a new scan/search is performed, the mode is switched, or the modal is closed.

## Capabilities

### New Capabilities

<!-- None -->

### Modified Capabilities

- `barcode-scanning`: Extend `Consume and Open workflows with continuous scan and undo` and `Transfer workflow` so typing a product name searches in-stock products, displays a clickable `Matching Products` list when multiple products match, and loads the selected product's in-stock items into the mode's item selection flow.

## Impact

- Frontend UI: `web/src/components/ScannerDrawer.tsx` (product search handling and `Matching Products` list rendering for `consume`, `open`, and `transfer` modes).
- Frontend tests: `web/src/components/Scanner.test.tsx` (unit/integration tests for product-name search, multi-match selection, single-match loading, zero-match messaging, and numeric unknown barcode handling across `consume`, `open`, and `transfer`).
- Backend API: No backend changes required; reuses existing `GET /api/products?status=in_stock&q=...` and `GET /api/products/:id` endpoints.

# Proposal

## Why

In the Purchase scanner modal, scanning or selecting an existing product leaves the `Due Date` field blank even when the product has a rolling average or fixed `default_due_days`, preventing users from seeing or adjusting the calculated due date before confirming. In addition, opening or transferring an item (including during Inventory Audit) does not reprint its label when the due date changes on a `per_item` product, and `/products/:id` displays the raw `label_print_mode` slug (`per_item`) instead of a human-readable label.

## What Changes

- **Pre-fill Purchase `Due Date` in `ScannerDrawer.tsx`**:
  - Populate `calculated_due_days` on `Product` in `loadProducts` (so both `GET /api/products` search hits and `POST /api/scan/resolve` responses carry it).
  - Pre-fill `purchaseDueDate` in `ScannerDrawer.tsx` (`today + effectiveDueDays`) whenever an existing product is matched by barcode/QR or selected from search.
- **Auto-reprint item labels on due-date change (`per_item`) & Inventory Audit parity**:
  - When opening an item (`POST /api/items/:id/open`, bulk `open`) or transferring an item (`POST /api/items/:id/transfer`, bulk `transfer`, or Inventory Audit `transfer`) causes `due_on_date` to change on a product with `label_print_mode == "per_item"`, automatically print a new item label and return any `print_warnings`.
  - Apply `On Freeze` / `On Thaw` due-date recalculation on Inventory Audit transfers and automatic due-date calculation on Inventory Audit item creation when `due_on_date` is omitted.
- **Human-readable `Label Mode` on `/products/:id`**:
  - Render `per_item` → `One label per item`, `single` → `Single product label`, `none` → `No label` in `ProductDetailPage.tsx`.

## Capabilities

### New Capabilities
<!-- None — this refines existing capabilities. -->

### Modified Capabilities
- `barcode-scanning`: Pre-populate the Purchase modal's `Due Date` input from the matched/selected product's rolling average or default due days, and apply freeze/thaw and auto due-date rules during Inventory Audit.
- `label-printing`: Automatically print a new item label when an item's `due_on_date` changes on Open or Transfer for products configured with `label_print_mode = "per_item"`.
- `web-ui`: Display human-readable `Label Mode` names (`One label per item`, `Single product label`, `No label`) instead of raw slugs on `/products/:id`.

## Impact

- Backend: `internal/api/catalog.go`, `internal/api/items.go`, `internal/api/workflows.go`, and unit tests in `internal/api/api_test.go`.
- Frontend: `web/src/components/ScannerDrawer.tsx`, `web/src/pages/ProductDetailPage.tsx`, and unit tests in `web/src/components/Scanner.test.tsx` and `web/src/pages/ProductDetailPage.test.tsx`.
- No database schema migrations required.

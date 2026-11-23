# Design: Purchase Due-Date Pre-fill, Auto-Reprint on Due-Date Change & Label Mode Display

## Context

See `proposal.md` for motivation. Key observations from the codebase audit:
- `internal/domain/domain.go` already implements `CalculatePurchaseDueDate`, `CalculateOpenDueDate`, and `CalculateTransferDueDate` matching the expected day-count rules.
- `internal/api/catalog.go` currently populates `CalculatedDueDays` only in `getProductByID`, not in `loadProducts` (so search hits from `GET /api/products` omit it).
- `web/src/components/ScannerDrawer.tsx` never sets `purchaseDueDate` when matching a barcode/product/item or picking a product from search hits.
- `internal/api/items.go` (`handleOpenItem`, `handleTransferItem`, `handleBulkItems`) and `internal/api/workflows.go` (`handleInventoryApply`) do not trigger `printItemLabel` when a `per_item` product's item changes `due_on_date`, and `handleInventoryApply` bypasses freeze/thaw and auto due-date calculations.
- `web/src/pages/ProductDetailPage.tsx` renders raw `{product.label_print_mode}` (`per_item` / `single` / `none`).

## Goals / Non-Goals

**Goals:**
- Pre-fill `purchaseDueDate` in `ScannerDrawer.tsx` whenever an existing product is matched or selected, using `calculated_due_days` (when `use_average_for_due_date` is true) or `default_due_days`.
- Automatically reprint an item label whenever Open or Transfer (single, bulk, or Inventory Audit) changes `due_on_date` on a product with `label_print_mode == "per_item"`.
- Ensure Inventory Audit transfers apply freeze/thaw due-date rules and Inventory Audit creations apply default/rolling-average due dates when `due_on_date` is omitted.
- Display human-readable `Label Mode` labels on `/products/:id`.

**Non-Goals:**
- Changing the underlying day-count formulas in `internal/domain/domain.go`.
- Auto-reprinting when a user manually edits a due date via `PATCH /api/items/:id` or bulk `update_due_date` (scoped specifically to Open and Move/Transfer).

## Decisions

### 1. Populate `CalculatedDueDays` in `loadProducts` (`internal/api/catalog.go`)
- In `loadProducts`, after scanning products, for products with `UseAverageForDueDate == true`, populate `p.CalculatedDueDays = s.productRollingAverageDueDays(ctx, p.ID)` (and remove the now-redundant single-product call in `getProductByID`).
- Both `GET /api/products` (used by Purchase search) and `GET /api/products/:id` / `POST /api/scan/resolve` now return `calculated_due_days` consistently.

### 2. Pre-fill `purchaseDueDate` in `ScannerDrawer.tsx`
- Add helper `computeDefaultDueDateStr(p: Product): string`:
  - `const days = p.use_average_for_due_date ? (p.calculated_due_days ?? p.default_due_days) : p.default_due_days;`
  - If `days == null || days <= 0`, return `""`.
  - Compute local date `today + days` and format as `YYYY-MM-DD`.
- Call `setPurchaseDueDate(computeDefaultDueDateStr(p))` in `handlePurchaseScan` (for `barcode`, `product`, `item` resolutions) AND when clicking a product in `purchaseSearchHits` (and reset `setPurchaseDueDate("")` in `resetSubState()` and unknown barcode scans).

### 3. Auto-Reprint on Due-Date Change (`internal/api/items.go` & `internal/api/workflows.go`)
- Add helper `dueDateChanged(prev, next *string) bool` comparing nil-safe string values.
- Add helper `s.reprintIfDueDateChanged(ctx, r, product, prevDue, updatedItem) []string`:
  - If `product != nil && product.LabelPrintMode == "per_item" && updatedItem != nil && dueDateChanged(prevDue, updatedItem.DueOnDate)`: return `s.printItemLabel(ctx, r, *updatedItem)`.
  - Otherwise return `nil`.
- Call `reprintIfDueDateChanged` from:
  - `handleOpenItem` (include `print_warnings` in JSON response)
  - `handleTransferItem` (return `product` from `transferSingleItem` or fetch once; include `print_warnings` in JSON response)
  - `handleBulkItems` (`open` and `transfer` cases; append to `warnings`)
  - `handleInventoryApply` (route `TransferItemIDs` through `transferSingleItem` after commit or apply freeze/thaw inside the transaction + reprint after commit, and fill auto due date on `CreateItems` when `c.DueOnDate == nil || *c.DueOnDate == ""`; include `print_warnings` in JSON response).

### 4. Friendly `Label Mode` Display (`ProductDetailPage.tsx`)
- Map `label_print_mode` via a small lookup map:
  - `per_item`: `"One label per item"`
  - `single`: `"Single product label"`
  - `none`: `"No label"`
  - fallback: `product.label_print_mode`.

# Design: Rolling-Average Due Days Default & Display

## Context

See `proposal.md` for motivation. Currently:
- `internal/domain/domain.go` implements `CalculatePurchaseDueDate(purchasedOn, defaultDueDays, useAverage, recentOffsets)` which computes the rounded mean of `recentOffsets` when `useAverage` is true.
- `internal/api/items.go` (`computeProductDueDate`) queries the last `due_date_average_count` items for a product with non-null `purchased_on_date` and `due_on_date`, ordered by `purchased_on_date DESC, id DESC LIMIT ?`.
- `web/src/pages/ProductFormPage.tsx` initializes `useAvg` to `false` and always leaves the `Due Days` input editable.
- `web/src/components/ScannerDrawer.tsx` creates new products in Purchase mode without setting `use_average_for_due_date: true` or disabling `Default due days`.
- `web/src/pages/ProductDetailPage.tsx` displays `product.default_due_days ?? "—"`, showing `—` even when a product has rolling-average history.

## Goals / Non-Goals

**Goals:**
- Reuse the exact existing rolling-average math and SQL query for both purchase due-date calculation and product detail display.
- Default `use_average_for_due_date` to `true` on new products in both `ProductFormPage` and `ScannerDrawer`.
- Prevent manual `Due Days` entry whenever `use_average_for_due_date` is checked.
- Display calculated rolling-average due days as `~X` on `/products/:id`.

**Non-Goals:**
- Changing the `due_date_average_count` setting or how purchase due dates are calculated for existing products.
- Migrating existing products that currently have `use_average_for_due_date = false`.

## Decisions

### 1. Shared Rolling-Average Calculation (`internal/domain/domain.go` & `internal/api/`)
- Extract `domain.CalculateRollingAverageDueDays(recentOffsets []int) *int` in `internal/domain/domain.go` (returning `nil` when empty or rounded average `<= 0`) and call it from `domain.CalculatePurchaseDueDate` so both paths share identical rounding.
- Extract `s.productRollingAverageDueDays(ctx context.Context, productID int64) *int` in `internal/api/items.go` using the exact existing query (`SELECT purchased_on_date, due_on_date FROM items WHERE product_id = ? AND purchased_on_date IS NOT NULL AND due_on_date IS NOT NULL ORDER BY purchased_on_date DESC, id DESC LIMIT ?` with `s.dueDateAverageCount(ctx)`).
- Add `CalculatedDueDays *int` (`json:"calculated_due_days"`) to `Product` in `internal/api/catalog.go`, and populate it on `GET /api/products/:id` (in `handleGetProduct` / `getProductByID`) whenever `product.UseAverageForDueDate` is true.

### 2. Form Defaults & Input Lock (`ProductFormPage.tsx` & `ScannerDrawer.tsx`)
- In `ProductFormPage.tsx`:
  - Initialize `useAvg` via `useState(!isEdit)` so creating a new product starts with rolling average checked, while editing an existing product still loads `p.use_average_for_due_date`.
  - Disable the `Due Days` `<input>` when `useAvg` is `true` (`disabled={useAvg}`, with `disabled:cursor-not-allowed disabled:opacity-50` and placeholder `"Auto"` when checked).
  - On submit, send `default_due_days: useAvg ? null : (dueDays ? Number(dueDays) : null)` so checked rolling-average products never carry a stale manual `default_due_days`.
- In `ScannerDrawer.tsx` (`Create Product & Add Items`):
  - Add `newProdUseAvg` state initialized to `true` (and reset to `true` in `resetSubState()` / new unknown barcode scan).
  - Render a compact checkbox `Use rolling average for due date` inside the `creatingNew` block and disable the `Default due days (optional)` input while checked.
  - Submit `use_average_for_due_date: newProdUseAvg` and `default_due_days: newProdUseAvg ? null : (newProdDueDays ? Number(newProdDueDays) : null)` inside `payload.new_product`.

### 3. `~X` Display on `/products/:id` (`ProductDetailPage.tsx`)
- Add `calculated_due_days?: number | null` to `Product` in `web/src/api.ts`.
- In `ProductDetailPage.tsx`'s `Default Due Days` tile:
  ```tsx
  {product.use_average_for_due_date
    ? product.calculated_due_days != null
      ? `~${product.calculated_due_days}`
      : "—"
    : (product.default_due_days ?? "—")}
  ```

## Risks / Trade-offs

- **Existing products with both `use_average_for_due_date=true` and a legacy `default_due_days` value**: On `/products/:id`, if `calculated_due_days` is `null` (no purchase history yet), we can fall back to `product.default_due_days ?? "—"` or show `"—"`. Showing `"—"` when `calculated_due_days == null` directly reflects that no rolling average exists yet (and `CalculatePurchaseDueDate` still preserves its fallback behavior if a legacy product had both).

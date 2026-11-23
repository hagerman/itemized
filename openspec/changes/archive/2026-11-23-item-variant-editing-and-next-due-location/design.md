# Design: Item Variant Editing & Next-Due Item Location

## Context

See `proposal.md` for motivation. Currently:
- `internal/api/catalog.go` (`loadProducts`) aggregates unconsumed items with `GROUP BY product_id` to compute `in_stock_count` and `MIN(due_on_date)` (`next_due_on_date`), and always populates `default_location_name` from `products.default_location_id`.
- `internal/api/items.go` (`handleUpdateItem`) already supports patching `variant_id` (including explicit `null` to clear), while `handleBulkItems` supports `consume`, `open`, `transfer`, `update_due_date`, and `print_label`.
- `web/src/pages/ProductsPage.tsx` and `web/src/pages/ProductDetailPage.tsx` render `product.default_location_name` in product cards and the product detail header.
- `web/src/pages/ProductDetailPage.tsx` renders `Items in Stock` (both mobile stacked cards and desktop table) without displaying `item.variant_name` or allowing variant changes on existing items.

## Goals / Non-Goals

**Goals:**
- Compute `next_location_name` accurately on every `Product` returned by `GET /api/products` and `GET /api/products/:id` in a single query with deterministic tie-breaking (`due_on_date ASC NULLS LAST, id ASC`).
- Replace `default_location_name` display with `next_location_name` on both `ProductsPage` and the `ProductDetailPage` header (while keeping `default_location_id` / `default_location_name` intact in the API for product editing and purchase defaults).
- Display each in-stock item's variant name and provide frictionless inline variant adjustment (plus bulk variant update) on `ProductDetailPage` for both mobile and desktop viewports.

**Non-Goals:**
- Removing `default_location_id` from the database or product edit form (it is still used as the default location for Quick Add and Purchase).
- Allowing cross-product variant assignment (an item's variant selector lists only variants belonging to that product, plus `None`).

## Decisions

### 1. Single-pass `next_location_name` calculation in `internal/api/catalog.go`
Add `NextLocationName string` (`json:"next_location_name,omitempty"`) to `Product`.
In `loadProducts`, replace the `GROUP BY` query with an ordered scan over unconsumed items:
```sql
SELECT product_id, location_id, due_on_date
FROM items
WHERE consumed_on_date IS NULL
ORDER BY
  product_id ASC,
  CASE WHEN due_on_date IS NULL OR due_on_date = '' THEN 1 ELSE 0 END ASC,
  due_on_date ASC,
  id ASC
```
- The first row seen for each `product_id` determines both `nextDue` (when `due_on_date` is non-empty) and `nextLocationName` (resolved via `locMap[locationID].HierarchyName`).
- Every row increments `count`.
- Because `getProductByID` delegates to `loadProducts`, both `GET /api/products` and `GET /api/products/:id` automatically include `next_location_name`.
- When a product has zero unconsumed items, `next_location_name` is omitted (`""`).

### 2. Bulk `update_variant` in `internal/api/items.go`
Extend `handleBulkItems` to accept optional `VariantID *int64` (`json:"variant_id"`) and `action: "update_variant"`:
- Updates `items.variant_id` (allowing `nil` to clear) and `updated_at` for each selected item ID.
- Single-item variant edits continue to use the existing `PATCH /api/items/:id` endpoint with `{ variant_id: number | null }`.

### 3. Item Variant Display & Bulk Editing in `ProductDetailPage.tsx`
- **Mobile stacked cards (`md:hidden`)**:
  - Omit `#id` numbers. Render the selection checkbox beside a stacked text block:
    - When `it.variant_name` is set: display `it.variant_name` on the primary line (`text-sm font-medium text-slate-100`, neutral white, no prefix) and `it.location_name || "No location"` on the secondary line below (`text-xs text-slate-400`, wrapping naturally, no prefix).
    - When no variant is attached: display `it.location_name || "No location"` on the primary line (`text-sm font-medium text-slate-100`).
- **Desktop table (`hidden md:block`)**:
  - Remove the `ID` column; order columns as `Variant` (`text-sm font-medium text-slate-100`, neutral color, `it.variant_name || "—"`), `Location` (`text-xs text-slate-400`), `Purchased`, `Opened`, `Due`, `Actions`.
- **Bulk action bar**:
  - When `variants.length > 0`, provide the `Set variant...` selector (`None` + product variants) and `Set Variant` button calling `POST /api/items/bulk` with `action: "update_variant"` as the single, out-of-the-way control for adjusting or clearing item variants.

### 4. Header & Inventory List Location Display
- **`ProductDetailPage.tsx` header**: Render `{product.category_name}{product.next_location_name ? ` • ${product.next_location_name}` : ""}`.
- **`ProductsPage.tsx` cards**: Render `{p.category_name}{p.next_location_name ? ` • ${p.next_location_name}` : ""}`.

## Risks / Trade-offs

- **Out-of-stock products (e.g. Shopping List or All Items view)**: Because `next_location_name` is empty when `in_stock_count === 0`, the subtitle cleanly shows just `category_name` without a trailing bullet or misleading default location.

# Design

## Context

See [proposal.md](file:///Users/hagerman/Code/itemized/openspec/changes/merge-products/proposal.md) for motivation.

In the current codebase:
- `products` uses `id INTEGER PRIMARY KEY` (without `AUTOINCREMENT`) and an optional unique `legacy_uuid TEXT`, with an FTS5 trigram index (`products_fts`) synced via `AFTER INSERT / UPDATE / DELETE` triggers.
- `variants.product_id` and `items.product_id` both reference `products(id) ON DELETE CASCADE`. `barcodes.variant_id` references `variants(id) ON DELETE CASCADE`, and `items.variant_id` references `variants(id) ON DELETE SET NULL`. There is no uniqueness constraint on `(variants.product_id, variants.name)`.
- Product QR codes resolve in two places: `GET /go/p/{id}` (`handleQRProduct` in `internal/api/server.go`) and `POST /api/scan/resolve` (`resolveProductByToken` in `internal/api/workflows.go`). Both accept either an integer product ID or a `legacy_uuid`. All scanner modes (`Purchase`, `Consume`, `Open`, `Transfer`, `Inventory`) route through `POST /api/scan/resolve`.
- On the frontend, `ProductsPage.tsx` already implements desktop-only row checkboxes, a select-all header checkbox, and a sticky floating bulk actions bar (`products-bulk-bar`, hidden below `md`) with a `Delete` button. Modal dialogs use `ModalBackdrop` (`web/src/components/ModalBackdrop.tsx`) for consistent backdrop-click dismissal.

## Goals / Non-Goals

**Goals:**
- Provide an atomic, single-request backend merge operation (`POST /api/products/merge`) that moves all variants (and their barcodes) and all items (unconsumed and consumed) to the destination product, deletes source products, and records merge-link aliases.
- Ensure old printed product QR codes (`/go/p/<id>`, `/go/p/<legacy-uuid>`) and bare legacy UUIDs transparently resolve to the destination product, including across chained merges (A → B → C).
- Prevent newly created products from reusing integer IDs of previously merged products.
- Expose a clean, desktop-only `Merge` bulk action in `ProductsPage` when `>= 2` products are selected, with a destination-picker modal dialog.

**Non-Goals:**
- Merging or deduplicating variants with identical names (all variants are moved intact so barcodes and item variant links are preserved without loss).
- Combining or editing product-level metadata (name, category, default location, due-date defaults, measurements) during merge; the destination product's metadata is kept as-is.
- Exposing merge controls on mobile viewports, Quick Search, or `/search`.
- Redirecting `GET /api/products/{id}` REST lookups for deleted products (only QR redirect `/go/p/{id}` and scan resolution `POST /api/scan/resolve` follow merge aliases).

## Decisions

### 1. Dedicated `product_merges` table (Migration `002_product_merges.sql`)
We will add a `product_merges` table:
```sql
CREATE TABLE product_merges (
    source_product_id INTEGER PRIMARY KEY,
    source_legacy_uuid TEXT,
    target_product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    merged_at TEXT NOT NULL
);

CREATE INDEX idx_product_merges_target_product_id ON product_merges (target_product_id);
CREATE UNIQUE INDEX idx_product_merges_source_legacy_uuid
    ON product_merges (source_legacy_uuid)
    WHERE source_legacy_uuid IS NOT NULL;
```
**Rationale**:
- Keeping deleted source products out of `products` means FTS5 triggers, product list queries, status counts, and `ON DELETE` relationships continue working with zero special-case `WHERE merged_into_id IS NULL` filtering across the entire codebase.
- `target_product_id REFERENCES products(id) ON DELETE CASCADE` automatically cleans up aliases if the destination product itself is later permanently deleted.
- **Alternative considered**: Soft-deleting merged products via a `merged_into_product_id` column on `products`. Rejected because every query against `products`, `products_fts`, and status counts would need to filter out merged rows, risking subtle leaks.

### 2. Chained merge repointing
Inside the merge transaction, before deleting source products, we run:
```sql
UPDATE product_merges
SET target_product_id = ?
WHERE target_product_id IN (...)
```
followed by inserting the new rows into `product_merges` for each source product `(id, legacy_uuid, target_product_id, now)`.
**Rationale**:
- Guarantees every alias in `product_merges` points directly to a live product in one hop (O(1) lookup, no recursive CTE or cycle risk).
- Ensures `ON DELETE CASCADE` on `target_product_id` doesn't delete prior aliases (A → B) when B is deleted during a B → C merge!

### 3. Preventing SQLite ID reuse for merged products
Because `products.id` is `INTEGER PRIMARY KEY` without `AUTOINCREMENT`, SQLite assigns `MAX(id) + 1` on insert and could reuse the ID of a deleted product if it happened to be the highest ID.
In `insertProduct` (`internal/api/catalog.go`), we will compute the next product ID as:
```sql
SELECT COALESCE(MAX(id), 0) + 1 FROM (
    SELECT MAX(id) AS id FROM products
    UNION ALL
    SELECT MAX(source_product_id) AS id FROM product_merges
)
```
and pass that explicit `id` in `INSERT INTO products (id, ...)`.
**Rationale**:
- Zero-risk compared to rebuilding the `products` table (and its FTS5 triggers and foreign keys) to add `AUTOINCREMENT`.
- `db.Open` uses `SetMaxOpenConns(1)`, so there is no concurrent-insert race on SQLite.

### 4. Merge API contract (`POST /api/products/merge`)
Request body:
```json
{
  "target_product_id": 4,
  "source_product_ids": [12, 19]
}
```
Validation:
- `target_product_id > 0` and `len(source_product_ids) > 0`; deduplicate `source_product_ids`; reject with HTTP 422 if `source_product_ids` is empty or contains `target_product_id` or any ID `<= 0`.
- Verify target product and every source product exist inside the transaction; return HTTP 404 if any is missing.
Execution (all in one transaction):
1. Query `(id, legacy_uuid)` of all source products to confirm existence and capture `legacy_uuid`s.
2. `UPDATE variants SET product_id = ?, updated_at = ? WHERE product_id IN (...)`
3. `UPDATE items SET product_id = ?, updated_at = ? WHERE product_id IN (...)`
4. `UPDATE product_merges SET target_product_id = ? WHERE target_product_id IN (...)`
5. `INSERT INTO product_merges (source_product_id, source_legacy_uuid, target_product_id, merged_at) VALUES (?, ?, ?, ?)` for each source product.
6. `DELETE FROM products WHERE id IN (...)` (since variants and items were already moved, `ON DELETE CASCADE` deletes nothing unintended; FTS5 `products_ad` trigger removes deleted products from search index).
7. Commit and return HTTP 200 `{ "product": <updated target product>, "merged_count": <int> }`.

### 5. Resolution fallback in `handleQRProduct` and `resolveProductByToken`
- Extract a small helper `resolveProductIDByToken(ctx, token string) (int64, error)` used by both `handleQRProduct` (`internal/api/server.go`) and `resolveProductByToken` (`internal/api/workflows.go`).
- For integer tokens: check `products WHERE id = ?`, then fall back to `product_merges WHERE source_product_id = ?`.
- For non-integer (UUID) tokens: lowercase and check `products WHERE legacy_uuid = ?`, then fall back to `product_merges WHERE source_legacy_uuid = ?`.
- Item QR codes (`/go/i/:id`) and retail barcodes (`barcodes`) require no special merge logic because `items.product_id` and `variants.product_id` are updated directly during the merge.

### 6. Desktop-only bulk merge UI (`ProductsPage.tsx`)
- In `products-bulk-bar`, render a `Merge` button (with a `GitMerge` icon from `lucide-react`) alongside `Delete` only when `activeSelectedIds.length >= 2`.
- Clicking `Merge` opens a `Merge Products` modal wrapped in `ModalBackdrop` (handling backdrop click dismissal) with `Escape` key dismissal.
- Inside the modal, list the currently selected products as radio options (showing product name, category, and in-stock count) defaulting to the first selected product, with a short note explaining that all variants, barcodes, and items from the other selected products will be moved into the chosen destination and old QR codes will redirect to it.
- On confirm, call `POST /api/products/merge`, close the modal, clear `selectedIds`, and invalidate `["products"]` queries so both the table and sidebar counts refresh. Disable controls while submitting and display any API error inline inside the modal.

## Risks / Trade-offs

- **Merged destination product subsequently deleted**: `ON DELETE CASCADE` removes `product_merges` rows pointing to it, so old QR codes cleanly return `product_not_found` / `unknown` instead of dangling references.
- **Duplicate variant names after merge**: If two merged products both have a variant named `"Default"`, both variants will appear on the destination product. This is acceptable and safer than auto-merging variants because each variant may have distinct measurements, barcodes, and item associations; users can manage variants afterward on the Product Detail page.
- **Rolling-average due dates**: Moving consumed and unconsumed items to the destination product includes those items in the destination product's rolling-average due-date history, which accurately reflects the consolidated purchase history.

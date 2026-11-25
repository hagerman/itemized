# Tasks

## 1. Database Migration & Product ID Allocation

- [x] 1.1 Create `internal/db/migrations/002_product_merges.sql` adding the `product_merges` table (`source_product_id INTEGER PRIMARY KEY`, `source_legacy_uuid TEXT`, `target_product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE`, `merged_at TEXT NOT NULL`) with `idx_product_merges_target_product_id` and partial unique `idx_product_merges_source_legacy_uuid`, and verify migration application via `go test ./internal/db/...`
- [x] 1.2 Update `insertProduct` in `internal/api/catalog.go` to compute the next product ID above both `MAX(products.id)` and `MAX(product_merges.source_product_id)` so merged product integer IDs are never reused, and add a unit test in `internal/api/api_test.go` verifying that creating a new product after merging the highest-ID product assigns a strictly higher ID

## 2. Backend Product Merge & Alias Resolution

- [x] 2.1 Implement `POST /api/products/merge` (`handleMergeProducts`) in `internal/api/catalog.go` and register the route in `internal/api/server.go`, atomically validating inputs (422 for invalid/self-merge, 404 for missing products), moving all `variants` and `items` (unconsumed and consumed) to `target_product_id`, repointing existing `product_merges` rows targeting any source product to `target_product_id`, inserting new `product_merges` rows for each source product's ID and `legacy_uuid`, and deleting the source products; verify with API tests in `internal/api/api_test.go` covering multi-product merge, chained merge (A → B → C), cascade cleanup on destination deletion, and validation error cases
- [x] 2.2 Add a shared product token resolution helper used by both `handleQRProduct` (`GET /go/p/{id}` in `internal/api/server.go`) and `resolveProductByToken` (`POST /api/scan/resolve` in `internal/api/workflows.go`) that falls back to `product_merges` (by `source_product_id` for integer tokens and `source_legacy_uuid` for UUID tokens) when no live product matches; verify with API tests in `internal/api/api_test.go` covering `/go/p/<merged-id>`, `/go/p/<merged-legacy-uuid>`, `POST /api/scan/resolve` with `/go/p/<merged-id>`, `/go/p/<merged-legacy-uuid>`, bare `<merged-legacy-uuid>`, and chained merges

## 3. Desktop Products List Bulk Merge UI

- [x] 3.1 Update `web/src/pages/ProductsPage.tsx` so the desktop-only floating bulk actions bar (`products-bulk-bar`) renders a `Merge` button alongside `Delete` only when at least 2 products are selected, and clicking `Merge` opens a `Merge Products` modal dialog wrapped in `ModalBackdrop` (supporting backdrop click and `Escape` dismissal) listing the selected products as destination choices, submitting `POST /api/products/merge`, displaying inline errors on failure, and closing the modal, clearing selection, and invalidating `["products"]` queries on success
- [x] 3.2 Add frontend tests in `web/src/pages/ProductsPage.test.tsx` verifying that `Merge` is hidden when 1 product is selected and visible when 2+ products are selected, that the `Merge Products` modal lists selected products, dismisses on backdrop click and `Escape`, submits `POST /api/products/merge` with the chosen destination and remaining source IDs, clears selection and refreshes on success, and displays API errors inline without clearing selection; verify with `npm test` in `web/`

## 4. Verification

- [x] 4.1 Run `go test ./...`, `go vet ./...`, and `gopls check` on all Go files (resolving `gopls` from `PATH` or `$(go env GOPATH)/bin/gopls`) and confirm zero errors or diagnostics
- [x] 4.2 Run `npm test` and `npm run build` in `web/` and confirm all frontend tests pass and the production bundle builds cleanly

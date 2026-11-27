# Tasks

## 1. Shared Inventory Cache Invalidation Helper

- [x] 1.1 Export `invalidateInventoryQueries(qc: QueryClient)` from `web/src/api.ts` invalidating `["products"]`, `["product"]`, `["quick-search"]`, and `["location"]`, and verify TypeScript compiles cleanly (`npm --prefix web run build` or `npx --prefix web tsc --noEmit`).

## 2. Product Create & Edit Refresh (`ProductFormPage`)

- [x] 2.1 Update `ProductFormPage.handleSubmit` in `web/src/pages/ProductFormPage.tsx` so editing a product updates any existing cached `["product", String(res.product.id)]` entry's `product` field (preserving `variants` and `items`) and both create and edit call `invalidateInventoryQueries(qc)` before navigating to `/products/${res.product.id}`; verify via updated tests in `web/src/pages/ProductFormPage.test.tsx`.
- [x] 2.2 Add regression tests in `web/src/pages/ProductFormPage.test.tsx` using a `QueryClient` with `staleTime: 15_000` (matching `App.tsx`) covering: (a) editing a product name from `/products/:id/edit` and navigating to `ProductDetailPage` at `/products/:id` immediately displays the updated name without reload and invalidates `["product"]`, `["products"]`, `["quick-search"]`, and `["location"]`; and (b) creating a new product at `/products/new` invalidates `["products"]`, `["product"]`, `["quick-search"]`, and `["location"]` before navigating; verify with `npm --prefix web test -- src/pages/ProductFormPage.test.tsx`.

## 3. Consistent Cache Refresh Across Other Inventory Mutation Views

- [x] 3.1 Update `web/src/pages/ProductDetailPage.tsx` (`refresh()` and delete handler, calling `qc.removeQueries({ queryKey: ["product", id] })` before `invalidateInventoryQueries(qc)` on delete), `web/src/pages/ProductsPage.tsx` (bulk delete, merge, and reclassify), `web/src/components/ScannerDrawer.tsx` (`invalidateInventory`), `web/src/pages/QrActionPage.tsx`, and `web/src/pages/TaxonomyPages.tsx` (category/location edits) to use `invalidateInventoryQueries(qc)`, and add/update unit tests in `web/src/pages/ProductDetailPage.test.tsx` and `web/src/pages/ProductsPage.test.tsx` verifying `["product"]`, `["products"]`, `["quick-search"]`, and `["location"]` invalidation; verify with `npm --prefix web test`.

## 4. Final Verification

- [x] 4.1 Run the full frontend test suite and production build (`npm --prefix web test && npm --prefix web run build`) and verify all tests pass and the bundle builds cleanly.
- [x] 4.2 Run `go test ./...`, `go vet ./...`, and `gopls check` on Go files (resolving `gopls` from `PATH` or `$(go env GOPATH)/bin/gopls`) and confirm zero errors or diagnostics.

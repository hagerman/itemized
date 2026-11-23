# Tasks

## 1. Backend Next-Due Location & Bulk Variant Update

- [x] 1.1 Add `NextLocationName` (`next_location_name`) to `Product` in `internal/api/catalog.go`, compute it in `loadProducts` from the soonest-due unconsumed item (missing due dates last, ties broken by lowest `id`), and add `update_variant` support (`variant_id`) to `handleBulkItems` in `internal/api/items.go`; add unit tests in `internal/api/api_test.go` covering soonest-due selection, equal/empty due-date tie-breaking, out-of-stock empty location, and bulk `update_variant`, and verify with `go test -v ./internal/api/...`.

## 2. Frontend Next-Due Location & Item Variant Display/Editing

- [x] 2.1 Add `next_location_name?: string` to `Product` in `web/src/api.ts`, and replace `default_location_name` with `next_location_name` (omitting the location bullet when empty) in `web/src/pages/ProductsPage.tsx` and the header subtitle of `web/src/pages/ProductDetailPage.tsx`; verify with `cd web && ./node_modules/.bin/tsc --noEmit`.
- [x] 2.2 Update `Items in Stock` in `web/src/pages/ProductDetailPage.tsx` (both mobile cards and desktop table) to remove item `#id` numbers, display Variant first (larger, neutral text, no `"Variant:"` prefix) followed by Location (smaller, muted neutral text, no `"Location:"` prefix, un-truncated on mobile; falling back to location on the primary line when no variant is attached), and keep variant reassignment/clearing in the bulk action bar via `POST /api/items/bulk` (`update_variant`); update `web/src/pages/ProductDetailPage.test.tsx` to verify the updated layout and bulk `update_variant`, and verify with `cd web && ./node_modules/.bin/vitest run --pool=forks && ./node_modules/.bin/tsc --noEmit && ./node_modules/.bin/vite build` and `go test ./... && go build ./...`.

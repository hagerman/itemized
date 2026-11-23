# Tasks

## 1. Backend Calculated Rolling-Average Due Days

- [x] 1.1 Extract `CalculateRollingAverageDueDays` in `internal/domain/domain.go` (reused by `CalculatePurchaseDueDate`), add `productRollingAverageDueDays` in `internal/api/items.go` (reused by `computeProductDueDate`), and populate `CalculatedDueDays` (`calculated_due_days`) on `Product` in `internal/api/catalog.go` when `use_average_for_due_date` is true; add unit tests in `internal/api/api_test.go` verifying calculated rolling average over the last `due_date_average_count` purchases and `nil` when no qualifying history exists, and verify with `go test -v ./internal/domain/... ./internal/api/...`.

## 2. Frontend Defaults, Due-Days Lock & `~X` Display

- [x] 2.1 Add `calculated_due_days?: number | null` to `Product` in `web/src/api.ts`, default `useAvg` to `true` for new products in `web/src/pages/ProductFormPage.tsx` and `web/src/components/ScannerDrawer.tsx` (Purchase new product creation), and disable the manual `Due Days` input whenever rolling average is checked (submitting `default_due_days: null`); verify with `cd web && ./node_modules/.bin/tsc --noEmit`.
- [x] 2.2 Render `Default Due Days` on `web/src/pages/ProductDetailPage.tsx` as `~X` when `use_average_for_due_date` is true and `calculated_due_days != null` (or `—` otherwise), add Vitest tests in `web/src/pages/ProductDetailPage.test.tsx` (and `ProductFormPage` / `Scanner.test.tsx` coverage for default-checked + disabled `Due Days`), and verify with `cd web && ./node_modules/.bin/vitest run --pool=forks && ./node_modules/.bin/tsc --noEmit && ./node_modules/.bin/vite build` and `go test ./... && go build ./...`.

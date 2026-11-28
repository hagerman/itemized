# Tasks

## 1. Fix Desktop Table Column Header Hover Contrast

- [x] 1.1 Update the six sortable column header `<button>` elements in `web/src/pages/ProductsPage.tsx` (`Product`, `Category`, `Location`, `Stock`, `Next Due`, and `Shopping List`) from bare `hover:text-white` to `hover:text-slate-900 dark:hover:text-white`, and verify no bare `hover:text-white` remains in `web/src/pages/ProductsPage.tsx`.
- [x] 1.2 Add a unit test in `web/src/pages/ProductsPage.test.tsx` asserting that all six desktop table column header sort buttons include `hover:text-slate-900` and `dark:hover:text-white` and do not include bare `hover:text-white`, and verify `npm --prefix web run test` and `npm --prefix web run build` pass.

## 2. Repository Verification

- [x] 2.1 Run `go test ./...`, `go vet ./...`, and `gopls check` on Go files (resolving `gopls` from `PATH` or `$(go env GOPATH)/bin/gopls`) and verify all checks pass with no diagnostics.

# Tasks

## 1. Inline Freezer Create Action in HierarchySelect

- [x] 1.1 Update `web/src/components/HierarchySelect.tsx` to remove the standalone `Freezer` checkbox state/UI and instead render two explicit action buttons when `showFreezerOption` is enabled: `+ Create "<name>"` (`is_freezer: false`) and `+ Create Freezer "<name>"` with a snowflake icon (`is_freezer: true`), preserving parent suffixes (`in <parent>`) and inline error handling; verify with updated Vitest tests in `web/src/components/HierarchySelect.test.tsx` and `web/src/pages/ProductFormPage.test.tsx`.

## 2. Verification

- [x] 2.1 Run `make build` (to rebuild `web/dist` and the embedded Go binary), `go test ./...`, `go vet ./...`, and `gopls check` on Go files (resolving `gopls` from `PATH` or `$(go env GOPATH)/bin/gopls`), plus `make check`, and fix any reported failures or diagnostics.

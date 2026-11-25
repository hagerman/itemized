# Tasks

## 1. Products Toolbar Layout Fix

- [x] 1.1 Update `web/src/pages/ProductsPage.tsx` to remove `space-y-2` from `data-testid="products-toolbar"` and add `mt-2` to the narrow-viewport `Clear Filters` wrapper (`@[640px]:hidden`), verifying that `npm run build` in `web/` succeeds with no TypeScript or Vite errors.
- [x] 1.2 Add unit tests in `web/src/pages/ProductsPage.test.tsx` covering active-filter state to verify that `products-toolbar` does not carry `space-y-2`, that the inline `Clear Filters` button renders inside `products-toolbar-row` with `@[640px]:flex`, and that the wrapped narrow-viewport `Clear Filters` container carries `mt-2` and `@[640px]:hidden`; verify with `npm test` in `web/`.

## 2. Verification

- [x] 2.1 Run `npm test` and `npm run build` in `web/`, and run `go test ./...`, `go vet ./...`, and `gopls check` on Go files, confirming all checks pass with zero errors or diagnostics.

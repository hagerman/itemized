# Tasks

## 1. Compact HierarchySelect Variant

- [x] 1.1 Add an optional `size?: "default" | "sm"` prop to `HierarchySelect` in `web/src/components/HierarchySelect.tsx` (defaulting to `"default"` with `h-10 px-3 py-1.5 text-sm` and rendering `h-8 px-2.5 text-xs` with a `h-3.5 w-3.5` chevron when `size="sm"`), and add unit test assertions in `web/src/components/HierarchySelect.test.tsx` verifying both default and `"sm"` trigger classes pass via `npm --prefix web test -- HierarchySelect.test.tsx`.

## 2. Uniform Bulk Action Control Heights on Product Detail Page

- [x] 2.1 Update the bulk item actions bar in `web/src/pages/ProductDetailPage.tsx` so `Consume`, `Open`, `Reprint Labels`, conditional `Move`, conditional `Set Due`, conditional `Set Variant` buttons use `inline-flex h-8 items-center rounded-lg px-2.5 font-medium text-white`, the `Transfer to...` `HierarchySelect` uses `size="sm"`, and the bulk due-date `<input type="date">` (with an accessible `aria-label="Bulk due date"`) and `Set variant...` `<select>` use `h-8 rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-0 text-white`; verify all bulk action controls carry `h-8` by adding assertions in `web/src/pages/ProductDetailPage.test.tsx` and running `npm --prefix web test -- ProductDetailPage.test.tsx`.

## 3. Full Verification

- [x] 3.1 Run the full frontend test suite and production build (`npm --prefix web test` and `npm --prefix web run build`) and confirm all tests and type-checking/bundling pass.
- [x] 3.2 Run `go test ./...`, `go vet ./...`, and `gopls check` on Go files (resolving `gopls` from `PATH` or `$(go env GOPATH)/bin/gopls`) and confirm zero errors or diagnostics.

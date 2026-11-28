# Tasks

## 1. Backend Product Sorting API

- [x] 1.1 Extend `handleListProducts` in `internal/api/catalog.go` to handle `sort=category` (case-insensitive `category_name` asc, empty last), `sort=location` (case-insensitive `next_location_name` asc, empty last), and `sort=shopping_list` (`on_shopping_list` true first, then `low_stock_amount` desc, then case-insensitive `name` asc), with consistent case-insensitive `name` tie-breaking across all sort modes, and verify with `go test ./internal/api -run TestProduct`.
- [x] 1.2 Add unit tests in `internal/api/api_test.go` covering `GET /api/products?sort=category`, `sort=location` (including unset `next_location_name` last), `sort=shopping_list` (low-stock shortage vs manually added vs off-list), and tie-breaking, and verify the new tests pass with `go test ./internal/api/...`.

## 2. Frontend Inventory Table & Mobile Sort Controls

- [x] 2.1 Update `SORT_OPTIONS` in `web/src/pages/ProductsPage.tsx` to include all six sortable columns in the exact order of the desktop table columns (`name`, `category`, `location`, `stock`, `due_date`, `shopping_list`) and hide both toolbar sort dropdown controls (`<select>` and compact icon-only sort menu) at `md:` (`>= 768px`) using `md:hidden`, verifying via TypeScript typecheck/build (`npm --prefix web run build`).
- [x] 2.2 Make all six desktop table column headers (`Product`, `Category`, `Location`, `Stock`, `Next Due`, `Shopping List`) clickable sort buttons with `ArrowUpDown`, active highlight styling, and `aria-sort` in `web/src/pages/ProductsPage.tsx`, and verify in `web/src/pages/ProductsPage.test.tsx`.
- [x] 2.3 Update and expand `web/src/pages/ProductsPage.test.tsx` to assert: (a) both toolbar sort controls carry `md:hidden` so they are hidden on desktop while remaining available on mobile, (b) the mobile sort `<select>` and compact listbox render all six options in exact table column order, and (c) clicking every desktop column header (`Product`, `Category`, `Location`, `Stock`, `Next Due`, `Shopping List`) updates `sort`, triggers the corresponding `/api/products?status=...&sort=...` request, and updates `aria-sort`; verify all frontend tests pass via `npm --prefix web test`.

## 3. Full Verification

- [x] 3.1 Run `go test ./...`, `go vet ./...`, and `gopls check` on modified Go files (resolving `gopls` from `PATH` or `$(go env GOPATH)/bin/gopls`), plus `npm --prefix web test` and `npm --prefix web run build`, and confirm zero errors or diagnostics.

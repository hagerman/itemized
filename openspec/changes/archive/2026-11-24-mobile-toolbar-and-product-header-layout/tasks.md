# Tasks

## 1. Compact Mobile Index Toolbar (`ProductsPage`)

- [x] 1.1 Update the toolbar in `web/src/pages/ProductsPage.tsx` to wrap in a Tailwind `@container` and keep the filter input (`min-w-0 flex-1`), sort control, and create link on a single non-wrapping horizontal row, switching below `@[540px]` from the full `Sort: ...` `<select>` and `+ New Product` label to a compact icon-only sort dropdown button (`ArrowUpDown`, opening an accessible `listbox` popover with `Name`, `Soonest Due`, and `Stock Count`, active checkmark, outside-click dismissal, and `Escape` dismissal) and an icon-only `+` link (`aria-label="New Product"`), while keeping `Clear Filters` cleanly separated when active so it never wraps the primary row. Verify by inspecting the rendered DOM and running `cd web && npm run build`.
- [x] 1.2 Add unit tests in `web/src/pages/ProductsPage.test.tsx` covering the compact sort dropdown button (opening the menu, displaying active selection, changing sort order and re-querying `/api/products?status=in_stock&sort=...`, closing on outside click and `Escape`), the full-label sort `<select>` staying in sync, the accessible `New Product` `+` link (`href="/products/new"`), and the responsive container-query classes. Verify with `cd web && npm test -- src/pages/ProductsPage.test.tsx`.

## 2. Right-Aligned Single-Line-Preferred Product Header (`ProductDetailPage`)

- [x] 2.1 Update the header layout in `web/src/pages/ProductDetailPage.tsx` from `flex-col ... sm:flex-row` to a wrapping horizontal flex header (`flex flex-wrap items-center justify-between gap-x-3 gap-y-2 sm:flex-nowrap`) with a natural-width truncatable title group (`flex min-w-0 max-w-full items-center gap-3`) and a right-aligned action button group (`ml-auto flex shrink-0 items-center justify-end gap-1.5 sm:gap-2`) so the four icon buttons stay on the same line as the title when they fit and wrap right-aligned onto a second line when constrained. Verify with `cd web && npm run build`.
- [x] 2.2 Update `web/src/pages/ProductDetailPage.test.tsx` to assert the product header container uses `flex-wrap` (not `flex-col`) and that the header actions container is right-aligned (`ml-auto`, `justify-end`) while preserving all four accessible action buttons. Verify with `cd web && npm test -- src/pages/ProductDetailPage.test.tsx`.

## 3. Verification

- [x] 3.1 Run the full frontend test suite and production build (`cd web && npm test && npm run build`) and verify all tests and TypeScript/Vite checks pass with zero errors.
- [x] 3.2 Run `go test ./...`, `go vet ./...`, and `gopls check` on Go files (resolving `gopls` from `PATH` or `$(go env GOPATH)/bin/gopls`) and verify zero failures or diagnostics.

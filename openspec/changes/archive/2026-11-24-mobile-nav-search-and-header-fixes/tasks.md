# Tasks

## 1. Mobile Bottom Dock Active Highlighting & iOS Header Blur Fix

- [x] 1.1 Update `<header>` in `web/src/components/Layout.tsx` to use a solid opaque background (`bg-slate-900`) and remove `backdrop-blur` (and `bg-slate-900/70`), then update `web/src/components/Layout.test.tsx` to verify the header has `bg-slate-900` and does not include `backdrop-blur` (`cd web && npm test -- src/components/Layout.test.tsx`).
- [x] 1.2 Update the mobile bottom navigation dock in `web/src/components/Layout.tsx` so `Inventory` (`<Link to="/">`) is highlighted via foreground color (`text-indigo-400 font-semibold`, `aria-current="page"`, no background fill change) when `loc.pathname === "/"`, and `Search` (`<Link to="/search">`) is highlighted identically when `loc.pathname === "/search"` (with inactive tabs in `text-slate-400`, leaving desktop sidebar `Quick Search` modal intact); update `web/src/components/Layout.test.tsx` to verify active foreground color, no background highlight, and inactive states on `/`, `/search`, and `/settings` (`cd web && npm test -- src/components/Layout.test.tsx`).

## 2. Mobile Search Page & Back-to-Search Navigation

- [x] 2.1 Update `web/src/pages/SearchPage.tsx` (mirroring the Quick Search modal's behavior, URL `?q=` sync with `replace: true`, and `state.from` navigation to `/products/${p.id}`) so the divider (`border-b`) and results container are hidden when the search input is empty, shown with matching products when results exist, and shown with `"No products match this search."` when a non-empty query returns zero results; ensure `/search` is registered in `web/src/App.tsx` wrapped in `<Layout ... title="Search">`.
- [x] 2.2 Update `web/src/pages/ProductDetailPage.tsx` so its back `<Link>` navigates to `(location.state as { from?: string } | null)?.from || "/"` (with appropriate `aria-label` when returning to `/search`), preserving default `"/"` behavior when accessed directly.
- [x] 2.3 Update `web/src/pages/SearchPage.test.tsx` and `web/src/pages/ProductDetailPage.test.tsx` to verify: empty query hides the divider and empty-state text, matching queries show the divider and results, zero-match queries show the divider and `"No products match this search."`, clicking a result navigates to `/products/:id` with return state, and both browser back navigation and the Product Detail back button restore `/search?q=...` with prior results (`cd web && npm test -- src/pages/SearchPage.test.tsx src/pages/ProductDetailPage.test.tsx`).

## 3. End-to-End Verification

- [x] 3.1 Run the full frontend test suite and production build (`cd web && npm test && npm run build`) and confirm zero errors.
- [x] 3.2 Run `go test ./...`, `go vet ./...`, and `gopls check` on Go files (resolving `gopls` from `PATH` or `$(go env GOPATH)/bin/gopls`) and confirm zero diagnostics.

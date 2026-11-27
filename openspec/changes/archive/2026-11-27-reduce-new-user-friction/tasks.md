# Tasks

## 1. Starter Taxonomy API

- [x] 1.1 Implement `POST /api/onboarding/starter-taxonomy` in `internal/api/onboarding.go` and register it on the authenticated mux in `internal/api/server.go`, seeding the curated `Groceries`/`Household` category trees and `Kitchen`/`Garage`/`Bathroom`/`Laundry` location trees (with freezers flagged) atomically and idempotently, and verify with unit tests in `internal/api/onboarding_test.go` covering fresh seeding, idempotent re-runs, partial `{ categories, locations }` selection, and 401 when unauthenticated (`go test ./internal/api/...`).
- [x] 1.2 Document `POST /api/onboarding/starter-taxonomy` in `docs/api.md`, rebuild generated docs (`make docs-build`), and verify `go test ./internal/docsverify/...` passes.

## 2. Inline Creation in Hierarchical Selectors

- [x] 2.1 Extend `web/src/components/HierarchySelect.tsx` with optional `onCreate`, `createEntityLabel`, and `showFreezerOption` props so typing a non-matching name (or opening an empty list) displays `+ Create "<name>"` under the current drill-down parent (with an inline `Freezer` toggle when enabled), handles errors inline without closing, and selects the created node immediately; verify with Vitest tests in `web/src/components/HierarchySelect.test.tsx`.
- [x] 2.2 Wire inline category and location creation callbacks into the Purchase workflow dropdowns in `web/src/components/ScannerDrawer.tsx` and the Category/Default Location dropdowns in `web/src/pages/ProductFormPage.tsx` (calling `POST /api/categories` / `POST /api/locations` and invalidating React Query `["categories"]` and `["locations"]` caches); verify with Vitest tests in `web/src/components/Scanner.test.tsx` and `web/src/pages/ProductFormPage.test.tsx`.

## 3. Home Page Onboarding Card & Empty Taxonomy CTAs

- [x] 3.1 Expose a lightweight scanner-open trigger from `web/src/components/Layout.tsx` (so child pages can open the existing `ScannerDrawer` in `"purchase"` mode) and render the Get Started onboarding card in `web/src/pages/ProductsPage.tsx` when `status_counts.all === 0` and no filters are active (with 1-click `Load Starter Setup`, completed indicator once categories and locations exist, `Scan / Action` and `+ New Product` actions, and conditional non-HTTPS camera warning when `!window.isSecureContext` on non-localhost hosts); verify with Vitest tests in `web/src/pages/ProductsPage.test.tsx`.
- [x] 3.2 Add 1-click `Load Starter Categories` and `Load Starter Locations` actions to empty states on `/categories` and `/locations` in `web/src/pages/TaxonomyPages.tsx`, update `docs/get-started/getting-started.md` (and run `make docs-build`) to mention starter setup and inline picker creation, and verify with Vitest tests in `web/src/pages/TaxonomyPages.test.tsx` and `web/src/docs-check.test.ts`.

## 4. Verification

- [x] 4.1 Run `make build` (to rebuild `web/dist` and the embedded Go binary), `go test ./...`, `go vet ./...`, and `gopls check` on Go files (resolving `gopls` from `PATH` or `$(go env GOPATH)/bin/gopls`), plus `make check` (including frontend Vitest and docs verification), and fix any reported failures or diagnostics.

# Tasks

## 1. Backend printer availability flag

- [x] 1.1 Add a `hasPrinters(ctx context.Context) (bool, error)` helper in `internal/api/server.go` (checking `COUNT(1) FROM printers WHERE enabled = 1` in standard mode and `COUNT(1) FROM printers` in demo mode) and include `"printers_enabled"` in both standard and demo responses of `handleAuthStatus`; verify with `go test ./internal/api/...`
- [x] 1.2 Add Go API tests in `internal/api/api_test.go` and `internal/api/demo_test.go` verifying `GET /api/auth/status` returns `printers_enabled: false` with no enabled printers, `true` for both `admin` and `member` users after an enabled printer is added, `false` again after deletion (or when only disabled printers exist in standard mode), and `true` in demo mode while the seeded printer exists (flipping to `false` if deleted); verify with `go test ./internal/api/...`

## 2. Frontend printer availability state & Settings invalidation

- [x] 2.1 Add optional `printers_enabled?: boolean` to `AuthStatus` and export a shared `usePrintersEnabled()` helper hook in `web/src/api.ts` (reading the `["auth-status"]` React Query cache and returning `Boolean(data?.printers_enabled)`); verify TypeScript compilation with `npm --prefix web run build`
- [x] 2.2 Update `web/src/pages/SettingsPage.tsx` so adding or deleting a printer invalidates `["auth-status"]` alongside `["printers"]`, and add/update unit tests in `web/src/pages/SettingsPage.test.tsx` verifying `auth-status` invalidation on printer create and delete; verify with `npm --prefix web test -- --run src/pages/SettingsPage.test.tsx`

## 3. Conditional print buttons and label mode UI across views

- [x] 3.1 Update `web/src/pages/ProductDetailPage.tsx` to read `usePrintersEnabled()` and omit the header `Print Label` button, metadata `Label Mode` tile (dynamically sizing the summary grid to `sm:grid-cols-3`, `sm:grid-cols-4`, or `sm:grid-cols-5`), bulk `Reprint Labels` button, mobile card `Print` button (switching the card action row from `grid-cols-3` to `grid-cols-2`), and desktop table `Print` button when `false`; update `web/src/pages/ProductDetailPage.test.tsx` to cover both `printers_enabled: true` and `printers_enabled: false` and verify with `npm --prefix web test -- --run src/pages/ProductDetailPage.test.tsx`
- [x] 3.2 Update `web/src/pages/ProductFormPage.tsx` to read `usePrintersEnabled()` and omit the `Label Print Mode` select field (adjusting the `Minimum Stock` row grid cleanly) when `false` while still submitting `label_print_mode` unchanged on create/edit; update `web/src/pages/ProductFormPage.test.tsx` to verify both states and payload preservation and verify with `npm --prefix web test -- --run src/pages/ProductFormPage.test.tsx`
- [x] 3.3 Update `web/src/pages/TaxonomyPages.tsx` (`LocationsPage` and `LocationDetailPage`) to read `usePrintersEnabled()` and omit per-location `Print location label` icon buttons and the `Print Location Label` header button when `false`; update `web/src/pages/TaxonomyPages.test.tsx` to cover both `printers_enabled: true` and `printers_enabled: false` and verify with `npm --prefix web test -- --run src/pages/TaxonomyPages.test.tsx`
- [x] 3.4 Update `web/src/components/ScannerDrawer.tsx` to read `usePrintersEnabled()` and omit the Purchase `Label Mode` select field (switching the control grid from `sm:grid-cols-4` to `sm:grid-cols-3`) when `false` while still preserving `label_print_mode` on purchase submit; update `web/src/components/Scanner.test.tsx` to cover both `printers_enabled: true` and `printers_enabled: false` and verify with `npm --prefix web test -- --run src/components/Scanner.test.tsx`

## 4. Full verification

- [x] 4.1 Run `go test ./...`, `go vet ./...`, and `gopls check` on Go files (resolving `gopls` from `PATH` or `$(go env GOPATH)/bin/gopls`), plus `npm --prefix web test -- --run` and `npm --prefix web run build`, and confirm all checks pass with zero errors or diagnostics

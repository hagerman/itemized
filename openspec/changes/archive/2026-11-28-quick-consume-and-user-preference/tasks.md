# Tasks

## 1. Per-User Quick Actions Preference (DB & Auth)

- [x] 1.1 Add migration `internal/db/migrations/004_user_quick_actions.sql` adding `quick_actions_enabled INTEGER NOT NULL DEFAULT 1 CHECK (quick_actions_enabled IN (0, 1))` to `users`, wire `QuickActionsEnabled bool` (`json:"quick_actions_enabled"`) across `internal/auth/auth.go` (all user queries and `UpdateAccount`) and `PATCH /api/auth/account` in `internal/api/server.go`, and verify with unit tests in `internal/auth/auth_test.go` and `internal/api/api_test.go` covering defaults, migration of existing users, and independent account preference updates (`go test ./internal/db/... ./internal/auth/... ./internal/api/...`).

## 2. Quick Consume Next-Due Item API

- [x] 2.1 Implement `POST /api/products/{id}/consume-next` in `internal/api/items.go` and register it on the authenticated mux in `internal/api/server.go` (consuming the soonest-due unconsumed item in FEFO order, returning HTTP 200 `{ item, previous }`, 404 when product is missing, and 409 when out of stock), and verify with Go unit tests in `internal/api/api_test.go` covering FEFO selection, unset due-date tie-breaking, 409 out-of-stock, and 404 missing product (`go test ./internal/api/...`).
- [x] 2.2 Document `POST /api/products/{id}/consume-next` in `docs/api.md`, rebuild generated docs (`make docs-build`), and verify `go test ./internal/docsverify/...` passes.

## 3. Account Toggle & Quick Consume UI

- [x] 3.1 Add `quick_actions_enabled?: boolean` to `User` in `web/src/api.ts` and style the `Quick Actions` preference in `web/src/pages/SettingsPage.tsx` cohesively with `Appearance` (bold heading, concise description with label-printing guidance, and an `Enabled | Disabled` segmented `radiogroup` persisting via `PATCH /api/auth/account` or updating locally in demo mode); verify with Vitest tests in `web/src/pages/SettingsPage.test.tsx`.
- [x] 3.2 Render explicit `Consume` buttons on in-stock mobile product cards (in the card footer row) and in a dedicated trailing action column on desktop table rows in `web/src/pages/ProductsPage.tsx` (keeping the `Stock` column count-only, hiding buttons and the trailing column when `quick_actions_enabled === false`, stopping card/row navigation, calling `POST /api/products/{id}/consume-next`, refreshing counts, and showing an Undo toast backed by `PATCH /api/items/{id}`); verify with Vitest tests in `web/src/pages/ProductsPage.test.tsx`.
- [x] 3.3 Update user documentation in `docs/use/inventory-and-expiration.md`, `docs/configure/settings.md`, and `docs/configure/accounts-and-sso.md` to document the quick `Consume` button (with FEFO selection and Undo) and the per-user `Quick Actions` preference in Settings, rebuild generated docs (`make docs-build`), and verify `web/src/docs-check.test.ts` and `make docs-check` pass.

## 4. Verification

- [x] 4.1 Run `make build` (to rebuild `web/dist` and the embedded Go binary), `go test ./...`, `go vet ./...`, and `gopls check` on Go files (resolving `gopls` from `PATH` or `$(go env GOPATH)/bin/gopls`), plus `make check` (including frontend Vitest and docs verification), and fix any reported failures or diagnostics.

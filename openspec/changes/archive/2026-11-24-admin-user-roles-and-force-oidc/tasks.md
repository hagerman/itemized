# Tasks

## 1. Backend User Role Safeguards

- [x] 1.1 Add `ErrLastAdmin` and update `auth.Service.UpdateUserRole` in `internal/auth/auth.go` to run in a transaction and reject demoting the last remaining `admin` user; add unit tests in `internal/auth/auth_test.go` covering promotion, demotion with multiple admins, and last-admin rejection, verified with `go test ./internal/auth/...`
- [x] 1.2 Update `Server.handleUpdateUser` in `internal/api/server.go` to reject self-role modification with HTTP 422 (`"cannot change your own role"`) and map `auth.ErrLastAdmin` to HTTP 422; add API tests in `internal/api/api_test.go` verifying admin promote/demote, self-demotion 422, last-admin 422, and non-admin 403, verified with `go test ./internal/api/...`

## 2. Backend Force OIDC Setting and Enforcement

- [x] 2.1 Add `Force bool` and `ForceActive() bool` to `auth.OIDCConfig` in `internal/auth/oidc.go`, load `oidc_force` (with `OIDC_FORCE` env fallback) in `Server.oidcConfig`, expose `oidc_force` in `GET /api/settings` and `GET /api/auth/status`, validate and persist `oidc_force` in `PATCH /api/settings` (rejecting `true` when OIDC is unconfigured and resetting to `false` if issuer/client ID is cleared), and document `OIDC_FORCE` in `README.md`; verify with API tests in `internal/api/api_test.go`
- [x] 2.2 Enforce `oidcConfig.ForceActive()` in `Server.handleAuthLogin` (`internal/api/server.go`) to reject local email/password login attempts (cookie and bearer modes) with HTTP 403 while keeping OIDC login endpoints operational; verify with API tests in `internal/api/api_test.go` covering `POST /api/auth/login` rejection when forced and normal login when disabled

## 3. Frontend Admin Role Management and Force OIDC UI

- [x] 3.1 Update `AuthStatus` and `AppSettings` types in `web/src/api.ts` to include `oidc_force: boolean`, and pass `oidcForce` from `web/src/App.tsx` to `AuthPage`
- [x] 3.2 Update `web/src/pages/SettingsPage.tsx` to add a per-user role `<select>` (`member` / `admin`) calling `PATCH /api/users/{id}` for other users (keeping the current admin's own role static) and a "Force OIDC login (disable local password sign-in)" checkbox under OIDC settings (disabled unless issuer and client ID are populated, saved via `PATCH /api/settings`, invalidating `["settings"]` and `["auth-status"]`); add Vitest tests in `web/src/pages/SettingsPage.test.tsx` and verify with `cd web && npm test`
- [x] 3.3 Update `web/src/pages/AuthPage.tsx` so that when `initialized && oidcEnabled && oidcForce` is true, it hides the email/password login form, automatically redirects to `/api/auth/oidc/login`, and renders a redirecting state with a fallback "Sign in with OIDC" link; add Vitest tests in `web/src/pages/AuthPage.test.tsx` and verify with `cd web && npm test`
- [x] 3.4 Update `web/src/pages/SettingsPage.tsx` to also disable the "Auto-provision new household members on OIDC login" checkbox when `!oidcConfigured` (and send `"false"` on save when unconfigured); update `web/src/pages/SettingsPage.test.tsx` to verify both OIDC checkboxes are disabled until issuer and client ID are populated, verified with `cd web && npm test`

## 4. End-to-End Verification

- [x] 4.1 Run backend verification (`go test ./...`, `go vet ./...`, and `gopls check` on Go files) and frontend verification (`cd web && npm test && npm run build`) and confirm zero errors or diagnostics

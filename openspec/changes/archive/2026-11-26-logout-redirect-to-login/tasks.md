# Tasks

## 1. Fix Logout Redirect and Query Cache Cleanup

- [x] 1.1 Update `handleLogout` in `web/src/App.tsx` to call `POST /api/auth/logout` (with `try/finally` cleanup), cancel in-flight queries, remove all non-`["auth-status"]` queries, set `["auth-status"]` `user` to `null`, navigate to `/` (`replace: true`), and invalidate `["auth-status"]`; export `AppRoutes` (with optional `onOidcRedirect` prop forwarded to `AuthPage`) and verify `cd web && npm run build` passes with zero TypeScript errors.
- [x] 1.2 Add unit/integration tests in `web/src/App.test.tsx` verifying that clicking Logout from a nested route (e.g., `/settings`) calls `POST /api/auth/logout`, clears cached non-auth queries, resets the route to `/`, and immediately renders the login screen (including the OIDC sign-in button when `oidc_enabled` is true), and that clicking Logout with `oidc_enabled: true` and `oidc_force: true` immediately triggers the `/api/auth/oidc/login` redirect; verify `cd web && npm test` passes.

## 2. Full Verification

- [x] 2.1 Run `cd web && npm test && npm run build` and verify all frontend tests and production build succeed.
- [x] 2.2 Run `go test ./...`, `go vet ./...`, and `gopls check` on Go files and verify all checks pass with zero diagnostics.

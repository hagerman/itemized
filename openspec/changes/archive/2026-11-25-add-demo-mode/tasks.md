# Tasks

## 1. Demo Seeding and Reset Manager (`internal/demo`)

- [x] 1.1 Create `internal/demo/seed.go` with a deterministic household seed dataset (`Seed(ctx, tx, now)`) using dates relative to `now` UTC covering demo users (`demo@itemizedapp.com` admin, `chris@itemizedapp.com` member), hierarchical locations (including freezers), hierarchical categories, products across In Stock / Due Soon / Overdue / Opened / Consumed (rolling-average due dates) / Shopping List (low-stock + manual), variants with barcodes, and a sample disabled printer (`Kitchen Zebra ZSB`); verify with unit tests in `internal/demo/demo_test.go` that seeding populates all expected states and FTS5 search matches seeded products.
- [x] 1.2 Create `internal/demo/manager.go` implementing `Manager` with configurable reset interval (default `1h`, aligned to wall-clock boundaries via `Truncate(interval).Add(interval)`), startup seeding, mutex-guarded transactional `Reset` (wiping all tables, re-seeding, rebuilding FTS), lazy `EnsureFresh(ctx)` check, `NextResetAt()`, and optional background ticker (`Start(ctx)`); verify with unit tests in `internal/demo/demo_test.go` using an injectable clock that mutations are wiped on interval rollover and concurrent calls only trigger one reset per boundary.

## 2. Backend Demo Mode Integration (`internal/api` & `cmd/itemized`)

- [x] 2.1 Wire `DEMO_MODE` and `DEMO_RESET_INTERVAL` in `cmd/itemized/main.go` and `internal/api/server.go` so demo mode initializes `demo.Manager`, runs the lazy reset middleware before request dispatch, and starts the background reset ticker; update `README.md` environment variables table to document `DEMO_MODE` and `DEMO_RESET_INTERVAL`, and verify with `go test ./internal/api/...`.
- [x] 2.2 Implement demo auth bypass in `internal/api/server.go`: return `demo_mode`, `demo_reset_at`, `initialized: true`, and the seeded demo admin user from `GET /api/auth/status`; inject the seeded demo admin user in protected `/api/*` middleware and `/go/*` QR redirects; disable `/api/auth/login`, `/api/auth/setup`, `/api/auth/logout`, `/api/auth/oidc/*`, and `/api/auth/account` with HTTP 403 in demo mode; guard `demo@itemizedapp.com` against deletion/demotion/password reset in user management endpoints; verify with API tests in `internal/api/api_test.go`.
- [x] 2.3 Implement demo outbound network sandboxing and UPC rate limiting in `internal/api/server.go`, `internal/api/workflows.go`, and `internal/api/ratelimit.go`: skip TCP/IPP I/O in `printToActivePrinters` and reject `POST /api/printers/{id}/test` with a demo-mode notice while keeping `/api/label-templates` editable; lock/disable `oidc_*` and `llm_*` settings in `handleUpdateSettings`, `oidcConfig`, and `llmConfig`; enforce a 5-requests-per-minute rate limit (HTTP 429) on `POST /api/upc/lookup` in demo mode; verify with API tests in `internal/api/api_test.go`.

## 3. Frontend Demo Banner and UI Adaptations (`web/src`)

- [x] 3.1 Extend `AuthStatus` in `web/src/api.ts` with `demo_mode?: boolean` and `demo_reset_at?: string`, pass them through `web/src/App.tsx` to `Layout` and `SettingsPage`, render a persistent top demo banner in `web/src/components/Layout.tsx` showing live countdown/reset time with automatic React Query invalidation after `demo_reset_at`, and hide the Logout button in demo mode; verify with Vitest tests in `web/src/components/Layout.test.tsx`.
- [x] 3.2 Update `web/src/pages/SettingsPage.tsx` to indicate when demo mode is active and disable/annotate Account, OIDC, and LLM configuration sections accordingly; verify with Vitest tests in `web/src/pages/SettingsPage.test.tsx`.

## 4. End-to-End Verification

- [x] 4.1 Run backend and frontend verification suites: `go test ./...`, `go vet ./...`, `gopls check` on all Go files, and `cd web && npm test && npm run build`, confirming all tests, lints, and builds pass with zero errors.

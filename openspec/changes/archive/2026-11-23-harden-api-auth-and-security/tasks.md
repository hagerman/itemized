# Tasks

## 1. Admin Access Control

- [x] 1.1 Wrap `GET /api/settings`, `PATCH /api/settings`, `/api/printers*`, and `/api/label-templates*` with `adminOnly(...)` in `internal/api/server.go`, and verify with API tests in `internal/api/api_test.go` that `member` users receive HTTP 403 while `admin` users succeed and `member` users can still trigger label prints during normal inventory workflows.

## 2. Session Revocation & Login Rate Limiting

- [x] 2.1 Update `ResetPassword` in `internal/auth/auth.go` to revoke all sessions for the target user inside a transaction, and update `UpdateAccount` (and `handleUpdateAccount` in `internal/api/server.go`) to revoke all *other* sessions when `newPassword != ""` while keeping the current session active; verify with unit and API tests in `internal/auth/auth_test.go` and `internal/api/api_test.go`.
- [x] 2.2 Implement an in-memory per-IP and per-email rate limiter (`internal/api/ratelimit.go`) applied to `POST /api/auth/login` returning HTTP 429 when exceeded (with `TRUST_PROXY=true` support using rightmost non-private `X-Forwarded-For` / `X-Real-IP` fallback, and stale entry cleanup), and verify with API tests in `internal/api/api_test.go` covering IP throttling, email throttling, `TRUST_PROXY=true`, and ignored forwarding headers when `TRUST_PROXY` is off.

## 3. Secret Handling, Request Bounds & Error Sanitization

- [x] 3.1 Update `callGemini` in `internal/llm/llm.go` to send `cfg.APIKey` via the `x-goog-api-key` HTTP header instead of `?key=`, and sanitize failure warnings in `handleUPCClassify` (`internal/api/workflows.go`); verify with unit tests in `internal/llm/llm_test.go` confirming no `key=` query param is sent and header is present.
- [x] 3.2 Update `decodeJSON` in `internal/api/server.go` to enforce a 1 MiB `http.MaxBytesReader` limit (returning HTTP 413 on oversized bodies), enforce a maximum `quantity` of 500 (HTTP 422) in `handleCreateItems`, `handlePurchaseWorkflow`, and `handleInventoryApply`, and sanitize unexpected 500/upstream error responses via a logging helper (`writeInternalError`); verify with API tests in `internal/api/api_test.go`.

## 4. Settings UI Role Gating & Non-Root Container

- [x] 4.1 Update `web/src/pages/SettingsPage.tsx` to include an Account section (email/password update via `PATCH /api/auth/account`) for all users and gate Instance Configuration, Household Users, Label Printers, and ZPL Label Templates (and their queries) behind `user.role === "admin"`; add frontend unit tests verifying non-admin `member` rendering and run `npm test` and `npm run build` in `web/`.
- [x] 4.2 Update `Dockerfile` Stage 3 to create a non-root user/group (`itemized`, UID/GID `1000`), `chown` `/data`, and set `USER itemized`, add optional `TRUST_PROXY` (`false` default) to `unraid/itemized.xml`, and document `TRUST_PROXY` and `/data` bind-mount ownership notes in `README.md`; verify `Dockerfile` and XML template structure.

## 5. Final Verification

- [x] 5.1 Run full backend and frontend verification (`go test ./...`, `go vet ./...`, `gopls check` on all Go files, and `npm test && npm run build` in `web/`) and confirm zero failures or diagnostics.

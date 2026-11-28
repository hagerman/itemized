# Tasks

## 1. Personal API Tokens (DB & Auth)

- [x] 1.1 Add migration `internal/db/migrations/005_api_tokens.sql` creating `api_tokens` (`id`, `user_id`, `name`, `token_prefix`, `token_hash UNIQUE`, `last_used_at`, `expires_at`, `created_at` with `ON DELETE CASCADE`), implement `CreateAPIToken`, `ListAPITokens`, `RevokeAPIToken`, and `itm_` Bearer validation (with throttled `last_used_at` update and expiration check) in `internal/auth/tokens.go` and `internal/auth/auth.go`, and verify with Go unit tests in `internal/auth/auth_test.go` covering creation, one-time plaintext return, Bearer auth, `last_used_at`, expiration, cross-user isolation, and revocation (`go test ./internal/db/... ./internal/auth/...`).

## 2. Token Management & Summary API Endpoints

- [x] 2.1 Implement `GET /api/auth/tokens`, `POST /api/auth/tokens` (demo-mode 403 guard, validation for name and `expires_in_days`), and `DELETE /api/auth/tokens/{id}` in `internal/api/tokens.go` plus `GET /api/summary` in `internal/api/summary.go`, register them on the authenticated mux in `internal/api/server.go`, and verify with Go API tests in `internal/api/tokens_summary_test.go` covering token lifecycle, Bearer auth against `/api/summary`, role enforcement, demo-mode guards, and summary counts/product arrays (`go test ./internal/api/...`).
- [x] 2.2 Update `docs/api.md` to document Bearer authentication with Personal API Tokens (`itm_...`) and add verified `http run` examples for `POST /api/auth/tokens`, `GET /api/auth/tokens`, `GET /api/summary`, and `DELETE /api/auth/tokens/{id}`, rebuild docs (`make docs-build`), and verify `go test ./internal/docsverify/...` passes.

## 3. Settings API Tokens UI & Integration Docs

- [x] 3.1 Register `settings/api-tokens` in `web/src/screens.ts`, add `APIToken` types in `web/src/api.ts`, and add the **API Tokens** card in `web/src/pages/SettingsPage.tsx` (accessible to all roles, disabled in demo mode, with name + expiration preset form, one-time reveal + Copy button, token list with prefix/dates, Revoke button, and contextual **Learn more** link); verify with Vitest tests in `web/src/pages/SettingsPage.test.tsx` and `web/src/screens.test.ts`.
- [x] 3.2 Author `docs/configure/api-tokens-and-integrations.md` (mapped to `screens: [settings/api-tokens]`) covering Personal API Token setup/security, copy-pasteable Home Assistant `rest` sensor & automation YAML for `GET /api/summary`, iOS Shortcuts, and Mealie/Tandoor/curl examples; update `docs/configure/settings.md` to reference **API Tokens**; rebuild docs (`make docs-build`) and verify `make docs-check` and `web/src/docs-check.test.ts` pass.

## 4. Verification

- [x] 4.1 Run `make build` (to rebuild `web/dist` and the embedded Go binary), `go test ./...`, `go vet ./...`, and `gopls check` on Go files (resolving `gopls` from `PATH` or `$(go env GOPATH)/bin/gopls`), plus `make check` (including frontend Vitest and docs verification), and fix any reported failures or diagnostics.

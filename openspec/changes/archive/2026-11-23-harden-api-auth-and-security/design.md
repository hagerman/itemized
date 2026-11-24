# Design

## Context

See `proposal.md` for motivation and scope. Itemized is a self-hosted Go + embedded React SPA backed by SQLite, with two user roles (`admin` and `member`). Currently:
- `internal/api/server.go` guards `/api/users/*` with `auth.RequireAdmin`, but leaves `PATCH /api/settings`, `/api/printers*`, and `/api/label-templates*` accessible to any authenticated user.
- `internal/llm/llm.go` sends the Gemini API key in `?key=` on the request URL, and `handleUPCClassify` echoes `err.Error()` in the JSON response.
- `ResetPassword` and `UpdateAccount` update `password_hash` without deleting rows from `sessions`.
- `decodeJSON` reads `r.Body` without `http.MaxBytesReader`, item creation endpoints allow arbitrary `quantity`, `/api/auth/login` has no rate limiter, handlers pass `err.Error()` directly to `writeError`, and `Dockerfile` runs as `root`.

## Goals / Non-Goals

**Goals:**
- Enforce strict `admin` authorization on Instance Settings (`GET/PATCH /api/settings`), Printers (`/api/printers*`), and Label Templates (`/api/label-templates*`) on the backend and mirror that gating in `SettingsPage.tsx`.
- Eliminate Gemini API key leakage in URLs/logs/responses.
- Invalidate stale sessions on password reset (all sessions) and self password change (all other sessions).
- Add lightweight, dependency-free (or stdlib) login rate limiting, request body size limits, quantity upper bounds, and sanitized API error responses.
- Run the Docker runtime image as a dedicated non-root user.

**Non-Goals:**
- Changing OIDC email-linking behavior (e.g., requiring `email_verified: true`, which is intentionally excluded to preserve compatibility with self-hosted IdPs).
- Adding external infrastructure (Redis, WAF, or reverse proxy) for rate limiting.
- Changing how normal household `member` users trigger label prints during Purchase/Item/Location workflows (those server-side print calls continue to work seamlessly).
- Implementing full PUID/PGID runtime `gosu`/`su-exec` entrypoint scripts (standard static non-root `USER` in Alpine is preferred for simplicity and minimal attack surface).

## Decisions

1. **Admin-only route gating (`internal/api/server.go`)**
   - Wrap `PATCH /api/settings`, `GET/POST /api/printers`, `PATCH/DELETE /api/printers/{id}`, `POST /api/printers/{id}/test`, `GET /api/label-templates`, and `PUT/DELETE /api/label-templates/{entityType}` with `adminOnly(...)`.
   - Keep `GET /api/settings` authenticated (or admin-only? Checking frontend usage: `SettingsPage.tsx` is the only consumer of `GET /api/settings`, and `GET /api/settings` only returns redacted booleans plus `base_url`/`due_date_average_count`/provider names. Keeping `GET /api/settings` admin-only as well prevents `member` users from probing OIDC/LLM config; we'll gate `SettingsPage`'s `useQuery` calls with `enabled: user.role === "admin"`).
   - *Alternative considered*: Keeping `GET /api/settings` open to `member` users. Rejected because no non-admin UI page calls `/api/settings`, so gating both `GET` and `PATCH` is cleaner and avoids unnecessary metadata disclosure.

2. **Gemini header auth (`internal/llm/llm.go`)**
   - Remove `?key=%s` from `endpoint` in `callGemini` and set `req.Header.Set("x-goog-api-key", cfg.APIKey)` when `cfg.APIKey != ""`.
   - In `handleUPCClassify`, log the detailed error server-side (`log.Printf(...)`) and return `"warning": "classification unavailable"` (or provider-level status without URL/body) to the client.

3. **Session revocation on password change/reset (`internal/auth/auth.go`)**
   - Add `RevokeAllUserSessions(ctx, userID int64)` and `RevokeOtherUserSessions(ctx, userID, keepSessionID int64)`.
   - `ResetPassword`: execute password update and `DELETE FROM sessions WHERE user_id = ?` in a transaction.
   - `UpdateAccount`: accept `currentSessionID int64` (from `auth.SessionFromContext(r.Context())`), and when `newPassword != ""`, delete all sessions for `user_id` where `id != currentSessionID` in the same transaction.

4. **In-memory per-IP & per-email login rate limiter (`internal/api/ratelimit.go`)**
   - Implement a simple mutex-protected token bucket / sliding window limiter with two keys per login request:
     - **Client IP**: By default, extract host from `r.RemoteAddr`. When `TRUST_PROXY=true` (env var, exposed in `unraid/itemized.xml`), parse `X-Forwarded-For` right-to-left and pick the rightmost non-private/non-loopback IP (preventing leftmost header spoofing when a proxy appends the true peer IP), falling back to the leftmost valid IP, `X-Real-IP`, or `r.RemoteAddr`.
     - **Normalized email**: Lowercased/trimmed email from the login payload, so an attacker cannot brute-force a specific account even if `X-Forwarded-For` were misconfigured or distributed across IPs.
   - Default limits: e.g., 10 attempts per minute (burst 10) per IP and 10 attempts per minute (burst 10) per email, with periodic cleanup of stale entries so memory stays bounded.
   - Return `HTTP 429 Too Many Requests` with `{"error": "too many login attempts, please try again later"}` when either bucket is exceeded.
   - *Alternative considered*: Blindly trusting leftmost `X-Forwarded-For` (rejected: trivially bypassed by header spoofing) or `golang.org/x/time/rate` (stdlib implementation keeps `go.mod` dependency-free).

5. **Request body cap, quantity cap, and error sanitization (`internal/api/`)**
   - Add `const maxJSONBodyBytes = 1 << 20` (1 MiB) and update `decodeJSON(w http.ResponseWriter, r *http.Request, dst any)` to wrap `r.Body = http.MaxBytesReader(w, r.Body, maxJSONBodyBytes)`. If `*http.MaxBytesError` is returned, respond with `HTTP 413 Request Entity Too Large`.
   - Add `const maxBatchQuantity = 500` and validate `req.Quantity <= maxBatchQuantity` in `handleCreateItems`, `handlePurchaseWorkflow`, and each `CreateItems` entry (plus total) in `handleInventoryApply`, returning `HTTP 422` when exceeded.
   - Add `writeInternalError(w http.ResponseWriter, contextMsg string, err error)` that logs `log.Printf("%s: %v", contextMsg, err)` and writes `HTTP 500` with a generic `"internal server error"` JSON body. Audit all `writeError` calls so user-facing validation errors remain clear while raw DB/transport errors are logged instead of returned.

6. **Settings UI for non-admins (`web/src/pages/SettingsPage.tsx`)**
   - Add an `Account` section (allowing any user to update their email or change their password via `PATCH /api/auth/account`, which already exists on the backend!).
   - Gate `Instance Configuration`, `Household Users`, `Label Printers`, and `ZPL Label Templates` (and their `useQuery` hooks) behind `user.role === "admin"`.

7. **Non-root Docker runtime (`Dockerfile`)**
   - In Stage 3 (`alpine:3.21`), create a dedicated user/group (`addgroup -S itemized && adduser -S -G itemized -u 1000 itemized` or `99:100` — using UID/GID `1000:1000` is standard for Linux/Docker containers), `chown -R itemized:itemized /data`, and set `USER itemized`.

## Risks / Trade-offs

- **[Risk] Existing Unraid/Docker host `/data` bind mounts owned by `root:root` may fail to write when switching to non-root UID 1000** → Document in release notes / `README.md` that existing `/data` directories may need `chown -R 1000:1000 /mnt/user/appdata/itemized` (or `user: "0:0"` override if needed).
- **[Risk] Reverse-proxied deployments without `TRUST_PROXY=true` share one `r.RemoteAddr` for IP rate limiting** → Expose `TRUST_PROXY` in `unraid/itemized.xml` and `README.md`, and pair IP limiting with per-email limiting so misconfiguration cannot bypass account protection.
- **[Risk] Breaking API change for `member` accounts calling `/api/settings`, `/api/printers`, `/api/label-templates`** → Frontend Settings page is updated in lockstep so `member` users no longer trigger those queries and instead see the Account management card.

# Proposal

## Why

A security audit of the Itemized codebase identified high- and medium-severity vulnerabilities in access control, secret handling, session lifecycle, input bounds, and container runtime hardening. Addressing these findings before public release prevents privilege escalation from household `member` accounts to `admin`, blocks LLM API key leakage, ensures password resets invalidate active sessions, and hardens the API and container image against abuse.

## What Changes

- **BREAKING**: Restrict `PATCH /api/settings`, printer mutations/test-prints (`POST/PATCH/DELETE /api/printers`, `POST /api/printers/{id}/test`), and label template mutations (`PUT/DELETE /api/label-templates/{entityType}`) to `admin` users (`HTTP 403` for `member` users). Update the Settings UI so Instance Configuration, Label Printers, and ZPL Label Templates sections are admin-only.
- Switch Gemini API authentication in `internal/llm/llm.go` from the `?key=` URL query parameter to the `x-goog-api-key` HTTP header so API keys cannot leak into transport error messages, logs, or API responses.
- Revoke all existing sessions for a user on admin password reset (`ResetPassword`), and revoke all *other* sessions for a user when changing their own password (`UpdateAccount`).
- Add per-IP and per-email rate limiting on `POST /api/auth/login` with opt-in `TRUST_PROXY` support (`X-Forwarded-For` rightmost non-private IP / `X-Real-IP`) to slow credential brute-forcing safely behind reverse proxies.
- Enforce a JSON request body size limit (`http.MaxBytesReader`) in `decodeJSON` and a sane upper bound on item `quantity` (max 500 per request) across item creation, purchase, and inventory apply endpoints.
- Sanitize API error responses across handlers so raw internal SQLite, filesystem, or upstream HTTP error strings are logged server-side rather than leaked to clients.
- Update `Dockerfile` to run the runtime container as a non-root user with `/data` owned by that user.

## Capabilities

### New Capabilities

*(none — all changes harden existing capabilities)*

### Modified Capabilities

- `user-auth`: Revoke sessions on password reset/change; add login rate limiting; sanitize auth/API error responses and enforce request body limits.
- `inventory-catalog`: Restrict instance settings updates to administrators and enforce an upper bound on item `quantity` per request.
- `label-printing`: Restrict printer CRUD/test-print and custom ZPL template mutations to administrators.
- `upc-and-classification`: Authenticate Gemini requests via HTTP header (`x-goog-api-key`) and return sanitized classification warnings without leaking URLs or credentials.
- `web-ui`: Restrict Instance Configuration, Label Printers, and ZPL Label Templates management in Settings to administrators while keeping Account controls accessible to all users.
- `self-hosted-deployment`: Run the runtime container as a non-root user with writable `/data` permissions.

## Impact

- **Backend (`internal/auth`, `internal/api`, `internal/llm`)**: Middleware updates on routes in `internal/api/server.go`, session revocation in `internal/auth/`, request size/quantity guards and error sanitization in `internal/api/`, Gemini header auth in `internal/llm/llm.go`.
- **Frontend (`web/src/pages/SettingsPage.tsx`)**: Gate admin-only Settings sections (`Instance Configuration`, `Label Printers`, `ZPL Label Templates`) behind `user.role === "admin"`, and add an Account section/note if needed for `member` users.
- **Deployment (`Dockerfile`, `unraid/itemized.xml`)**: Add non-root user/group and `chown` `/data` in the Alpine runtime stage, and expose optional `TRUST_PROXY` variable in the Unraid template (existing Unraid bind mounts should ensure matching ownership considerations documented in design).
- **Tests**: Add Go unit/API tests covering admin-only 403 enforcement, Gemini header auth, session revocation on password change/reset, login rate limiting, body/quantity caps, and frontend Settings role gating tests.

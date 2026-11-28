# Design

## Context

See `proposal.md` for motivation and scope.

Current architecture constraints:
- `internal/auth/auth.go` validates both session cookies and `Authorization: Bearer <token>` headers inside `RequireAuth` → `Service.ValidateToken(ctx, rawToken)`.
- `sessions` are intentionally ephemeral (30-day TTL, deleted on password rotation and logout).
- `internal/api/catalog.go` already computes `in_stock`, `due_soon`, `overdue`, `shopping_list`, and `low_stock` status flags on `loadProducts(ctx, "")`.
- `web/src/screens.ts` registers contextual Help screen IDs, and `docs/configure/*.md` frontmatter maps `screens:` to in-app Help articles built by `make docs-build` and validated by `make docs-check`.

## Goals / Non-Goals

**Goals:**
- Provide GitHub/Home-Assistant-style Personal API Tokens (`itm_...`) that survive web logouts and password rotations, work even when Force OIDC is enabled, and can be individually named and revoked.
- Provide a single-poll `GET /api/summary` endpoint that maps cleanly to Home Assistant's built-in `rest` sensor platform without requiring a custom HACS integration.
- Deliver self-serve integration docs with copy-pasteable Home Assistant YAML, iOS Shortcuts, and curl examples.

**Non-Goals:**
- Fine-grained per-token permission scopes (tokens inherit the owning user's `admin` or `member` role; keeping it simple avoids scope-matrix complexity).
- Publishing a custom Home Assistant HACS Python integration (standard `rest` YAML works immediately with zero third-party installs).
- Admin viewing or revoking other users' personal tokens (deleting a user cascades and deletes their tokens via `ON DELETE CASCADE`).

## Decisions

### 1. Dedicated `api_tokens` Table (Migration `005_api_tokens.sql`)
- **Choice**: Create `api_tokens (id, user_id, name, token_prefix, token_hash UNIQUE, last_used_at, expires_at, created_at)` with `FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE` and indexes on `(user_id)` and `(token_hash)`.
- **Why**: Keeps long-lived integration credentials cleanly separated from browser/login `sessions`, so changing a web password or logging out doesn't silently break Home Assistant, while preserving `last_used_at` and human-readable `name` + `token_prefix` (`itm_<first 8 chars>`).
- **Token format**: `"itm_" + base64RawURL(32 random bytes)` (~47 chars). `token_prefix` stores the first 12 chars (e.g., `itm_aBcDeFgH`). Only `SHA-256(rawToken)` is stored in `token_hash`.
- **Auth lookup**: In `Service.ValidateToken(ctx, rawToken)`, if `strings.HasPrefix(rawToken, "itm_")`, look up in `api_tokens` by `HashToken(rawToken)` joined with `users`, verify `expires_at` (if non-null) is in the future, update `last_used_at` (when null or older than 5 minutes to avoid excessive SQLite writes on tight polling), and return `(user, nil, nil)`. Otherwise validate against `sessions` as before.

### 2. Token Management Routes & Demo Mode Guard
- **Choice**: Register `GET /api/auth/tokens`, `POST /api/auth/tokens`, and `DELETE /api/auth/tokens/{id}` on `authed` mux in `internal/api/server.go`.
- **Demo mode**: Reject `POST /api/auth/tokens` and `DELETE /api/auth/tokens/{id}` with HTTP 403 `"disabled in demo mode"` (and return empty `{"tokens": []}` on `GET` or allow empty list).
- **Validation**: Require non-empty trimmed `name` (max 100 chars). Optional `expires_in_days` integer (`> 0` and `<= 3650`, i.e., up to 10 years; omitted or `null` = never expires).

### 3. `GET /api/summary` Payload Shape
- **Choice**: Reuse `s.loadProducts(ctx, "")` in a new handler `handleSummary` to return:
  - `counts`: `{ in_stock_products, in_stock_items, all_products, due_soon, overdue, shopping_list, low_stock }`
  - `due_soon_products`, `overdue_products`, `shopping_list_products`: compact summaries sorted by soonest due date (for `due_soon` / `overdue`) or name (for `shopping_list`), capped/clean with `{ id, name, in_stock_count, next_due_on_date, next_location_name, low_stock_amount, manually_added_to_shopping_list }`.
- **Why**: Home Assistant's `rest` integration can poll `/api/summary` once every 5 minutes and expose multiple sensors (`due_soon`, `overdue`, `shopping_list`, `in_stock_products`) with product lists attached as `json_attributes`.

### 4. Contextual Help & Documentation
- **Choice**: Add `{ id: "settings/api-tokens", kind: "settings", label: "API Tokens" }` to `web/src/screens.ts` and create `docs/configure/api-tokens-and-integrations.md` declaring `screens: [settings/api-tokens]`.
- **Why**: Gives the **API Tokens** card a working **Learn more** link in-app AND publishes a full Home Assistant + iOS Shortcuts + Mealie/Tandoor guide in the static docs site.

## Risks / Trade-offs

- **SQLite write amplification on `last_used_at`**: Updating `last_used_at` on every single API request could add unnecessary writes under heavy polling. → Only update `last_used_at` when it is `NULL` or more than 5 minutes old.
- **Compromised user account with API tokens**: Password reset revokes `sessions` but leaves `api_tokens` intact unless revoked. → Clearly document in `api-tokens-and-integrations.md` to revoke tokens in Settings if a device/key is compromised; deleting a user cascades all tokens.

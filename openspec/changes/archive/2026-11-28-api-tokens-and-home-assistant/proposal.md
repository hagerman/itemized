# Proposal

## Why

Self-hosted users want to wire `itemized` into Home Assistant dashboards, expiration automations, iOS Shortcuts, and Mealie/Tandoor scripts, but today bearer tokens can only be obtained via short-lived login sessions (`POST /api/auth/login` with password) that expire in 30 days, break on password changes, and cannot be created at all when Force OIDC is enabled. Adding long-lived Personal API Tokens in Settings alongside a sensor-friendly `GET /api/summary` endpoint unlocks these integrations out of the box.

## What Changes

- **Personal API Tokens (DB & Auth)**: Add an `api_tokens` table (migration `005_api_tokens.sql`) storing SHA-256 hashed tokens (`itm_...`), human-readable names, visible key prefixes, optional `expires_at`, and `last_used_at` timestamps. Extend `ValidateToken` so `Authorization: Bearer itm_...` authenticates seamlessly on all protected `/api/*` endpoints (respecting the owning user's role and surviving web password rotations).
- **Token Management Endpoints**: Add `GET /api/auth/tokens`, `POST /api/auth/tokens` (returning the raw `itm_...` secret once), and `DELETE /api/auth/tokens/{id}` scoped to the signed-in user (disabled in demo mode).
- **Sensor-Friendly Summary Endpoint**: Add `GET /api/summary` returning compact inventory counts (`in_stock_products`, `in_stock_items`, `all_products`, `due_soon`, `overdue`, `shopping_list`, `low_stock`) plus lightweight lists (`due_soon_products`, `overdue_products`, `shopping_list_products`) tailored for single-poll Home Assistant `rest` sensors and automations.
- **Settings → API Tokens UI**: Add an **API Tokens** card on `/settings` (accessible to all authenticated users, disabled in demo mode) with create (name + optional expiration preset), one-time copyable token reveal, and token listing with revoke.
- **Self-Serve Integration Docs**: Add `docs/configure/api-tokens-and-integrations.md` (linked via contextual Help `settings/api-tokens`) with ready-to-paste Home Assistant `rest` sensor & automation YAML, iOS Shortcuts, and Mealie/Tandoor/curl examples, plus updates to `docs/configure/settings.md` and `docs/api.md`.

## Capabilities

### New Capabilities

<!-- None: all behaviors extend existing capabilities. -->

### Modified Capabilities

- `user-auth`: Add named, long-lived Personal API Tokens (`itm_...`, hashed at rest, optional expiration, `last_used_at` tracking, one-time reveal, per-user list/create/revoke endpoints, and Bearer authentication via `ValidateToken`).
- `inventory-catalog`: Add `GET /api/summary` exposing compact stock/expiration/shopping counts and lightweight product summaries for Home Assistant and automation clients.
- `web-ui`: Add the **API Tokens** management card on `/settings` (for all authenticated users, disabled in demo mode) with one-time token reveal/copy, expiration selection, revocation, and contextual Help (`settings/api-tokens`).

## Impact

- **Database & Auth (`internal/db/`, `internal/auth/`)**: Migration `005_api_tokens.sql`; token CRUD and `ValidateToken` support in `internal/auth/`; Go unit tests.
- **API (`internal/api/`)**: `GET/POST /api/auth/tokens`, `DELETE /api/auth/tokens/{id}`, and `GET /api/summary`; Go tests.
- **Frontend (`web/src/`)**: `web/src/screens.ts` (`settings/api-tokens`), `web/src/api.ts`, `web/src/pages/SettingsPage.tsx`, Vitest tests, and `make build`.
- **Documentation (`docs/`)**: New `docs/configure/api-tokens-and-integrations.md`, updated `docs/configure/settings.md` and `docs/api.md` (with verified `http run` examples), and `make docs-build` / `make docs-check`.

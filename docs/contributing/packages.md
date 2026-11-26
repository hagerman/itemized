---
title: Package map
summary: Complete inventory of every Go package under internal/, including what state or external services each package can write to.
audience: developer
entry_point: under-the-hood
order: 6
capabilities:
  - self-hosted-deployment
screens: []
---

This page maps every Go package under `internal/` and documents its write boundaries so contributors and coding agents know which packages mutate state or contact external services. Run `make check` to verify this map stays in sync with the codebase.

## Packages under `internal/`

- **`internal/api`**: HTTP server, route registration, JSON request/response handling, login/demo rate limiting, and SPA static file serving. **Writes**: Mutates all SQLite tables via `*sql.DB` (users, sessions, settings, categories, locations, products, variants, barcodes, items, printers, label templates) and dispatches outbound print, UPC, OIDC, and LLM calls.
- **`internal/auth`**: Password hashing (`bcrypt`), session token generation and cookie handling, `RequireAuth` / `RequireAdmin` middleware, and OIDC Authorization Code + PKCE flows. **Writes**: Inserts/updates/deletes rows in `users` and `sessions` in SQLite, sets/clears HTTP session cookies, and makes outbound HTTPS requests to the configured OIDC provider.
- **`internal/db`**: Opens the SQLite database in `WAL` mode with foreign keys enabled and runs embedded SQL migrations. **Writes**: Creates and migrates SQLite schema objects and `schema_migrations` records on disk.
- **`internal/db/migrations`**: Embedded `.sql` migration files (`001_initial.sql`, `002_product_merges.sql`). **Writes**: Read-only embedded assets executed by `internal/db`.
- **`internal/demo`**: Public demo mode seed generator and hourly wall-clock reset manager. **Writes**: Clears and re-seeds household tables in SQLite when `DEMO_MODE=true`.
- **`internal/docsverify`**: Test-only package verifying documentation parity (environment variables, `docs/api.md` error catalog and live HTTP examples, `internal/` package map, and `Makefile` targets). **Writes**: Test-only temporary SQLite databases under `t.TempDir()`; does not ship in production binaries.
- **`internal/domain`**: Core inventory domain types, rolling-average and open/freeze/thaw due-date calculations, and SQLite FTS5 trigram product search helpers. **Writes**: Queries and updates product/item domain records and FTS5 index tables via `*sql.DB`.
- **`internal/llm`**: Client for Anthropic, OpenAI, Gemini, and OpenAI-compatible (Ollama) product naming and reclassification endpoints. **Writes**: Makes outbound HTTP POST requests to the configured LLM API endpoint; does not write to SQLite.
- **`internal/printer`**: Renders Go `text/template` ZPL labels and transmits them over IPP (`goipp`) or raw TCP (`:9100`). **Writes**: Sends outbound print jobs to configured LAN printer endpoints; does not write to SQLite.
- **`internal/printer/templates`**: Embedded default ZPL label templates (`item.zpl`, `product.zpl`, `location.zpl`). **Writes**: Read-only embedded assets rendered by `internal/printer`.
- **`internal/upc`**: Client for OpenFoodFacts retail barcode lookup. **Writes**: Read-only outbound HTTP GET requests to OpenFoodFacts; does not write to SQLite.

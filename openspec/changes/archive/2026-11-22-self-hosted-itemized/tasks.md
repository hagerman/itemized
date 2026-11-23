# Tasks

## 1. Project Scaffolding & SQLite Foundation

- [x] 1.1 Initialize Go module (`go.mod`) and directory layout (`cmd/itemized`, `cmd/itemized-migrate`, `internal/{auth,db,api,domain,printer,upc,llm}`, `web/`), verifying `go build ./...` succeeds on empty packages.
- [x] 1.2 Implement `internal/db` with pure-Go SQLite (`modernc.org/sqlite`), `WAL` mode, `foreign_keys=ON`, `busy_timeout=5000`, and an embedded SQL migration runner; add unit tests verifying schema creation, foreign-key enforcement, and idempotent re-runs (`go test ./internal/db/...`).
- [x] 1.3 Author initial SQLite schema migration for all 11 tables (`users`, `sessions`, `settings`, `categories`, `locations`, `products`, `variants`, `barcodes`, `items`, `printers`, `label_templates`) using `INTEGER PRIMARY KEY`, unique partial indexes on `legacy_uuid` for `items`, `products`, and `locations`, plus `products_fts` (FTS5 `trigram`) and sync triggers; verify FTS5 substring search and trigger updates in `internal/db` tests.

## 2. Authentication & User Management

- [x] 2.1 Implement `internal/auth` password hashing/verification (bcrypt compatible with legacy Rails digests) and persisted `sessions` supporting both `HttpOnly` cookies and `Authorization: Bearer` tokens; verify unit tests cover login, invalid credentials, Bearer auth, cookie auth, and logout revocation (`go test ./internal/auth/...`).
- [x] 2.2 Implement first-run Admin setup endpoint (active only when `users` is empty) and Admin-only user management endpoints (`GET/POST/PATCH/DELETE /api/users`, admin password reset); verify HTTP tests confirm closed registration, 403 for non-admins, and setup lockout after first user creation.
- [x] 2.3 Implement optional OIDC Authorization Code + PKCE flow (`coreos/go-oidc/v3`) configurable via `settings`/env vars, linking `(oidc_issuer, oidc_subject)` and issuing local sessions; verify tests cover OIDC-disabled mode and mocked OIDC callback linking (`go test ./internal/auth/...`).

## 3. Core Inventory Domain & REST API

- [x] 3.1 Implement `internal/domain` logic for measurement validation (at most one of volume/weight/length), due-date calculation (`use_average_for_due_date` using `due_date_average_count` setting, `default_due_days`, `default_due_days_on_open`, `default_due_days_on_freeze`, `default_due_days_on_thaw`), and shopping-list / stock-status predicates; verify with table-driven unit tests (`go test ./internal/domain/...`).
- [x] 3.2 Implement CRUD and search API handlers for `categories` (tree), `locations` (tree + `is_freezer`), `products` (with FTS5 search, stock counts, shopping list filter, due-soon/overdue filters), `variants`, `barcodes` (409 on duplicate), `items` (create, update, consume, open, transfer, bulk update), and `settings`; verify with API integration tests (`go test ./internal/api/...`).
- [x] 3.3 Implement legacy QR redirect routes (`GET /go/i/:id`, `GET /go/p/:id`, `GET /go/l/:id` resolving both integer IDs and `legacy_uuid`) and `GET /up` healthcheck; verify HTTP tests confirm redirects for integer IDs, `legacy_uuid`s, consumed-item notice, and not-found handling.

## 4. Scanning Resolution & Batch Workflow APIs

- [x] 4.1 Implement `POST /api/scan/resolve` to parse `/go/{i,p,l}/<id-or-uuid>` on any hostname, bare UUIDs, or retail barcodes and resolve numeric IDs or `legacy_uuid`s into typed resolution payloads with unconsumed items; verify tests cover legacy UUID hostnames, new integer QR URLs, unknown barcodes, and all entity kinds (`go test ./internal/api/...`).
- [x] 4.2 Implement Purchase, Consume/Open, Transfer, and Inventory Audit batch endpoints (including previous-state return for Undo and transactional audit apply); verify API tests cover multi-item purchase, continuous consume/open + undo patch, freezer freeze/thaw transfer rules, and atomic inventory reconciliation.

## 5. UPC Lookup & Optional LLM Classification

- [x] 5.1 Implement `internal/upc` stateless OpenFoodFacts HTTP client and expose `POST /api/upc/lookup`; verify tests using `httptest.Server` confirm normalized responses on match and graceful handling on not-found/upstream errors (`go test ./internal/upc/...`).
- [x] 5.2 Implement `internal/llm` opt-in classifier supporting `anthropic`, `openai`, `gemini`, and `openai-compatible` (Ollama) endpoints with structured JSON output (`product_name`, measurement, `category_id`) and expose `POST /api/upc/classify`; verify tests confirm graceful no-op when unconfigured and strict `category_id` validation against mocked responses (`go test ./internal/llm/...`).

## 6. Direct Label Printing & ZPL Templates

- [x] 6.1 Port `goipp` IPP client and `text/template` helper functions from `legacy/itemized_print_service-main` into `internal/printer`, implement `Driver` interface with `ipp_zpl` and `raw_tcp_zpl` drivers, and embed default `item`, `product`, and `location` ZPL templates; verify unit tests cover ZPL rendering, `ipp_zpl` against mock HTTP server, and `raw_tcp_zpl` against local TCP listener (`go test ./internal/printer/...`).
- [x] 6.2 Implement Printer CRUD, connectivity test print, `LabelTemplate` CRUD + reset-to-default endpoints, and automatic batch printing on Purchase respecting `label_print_mode` (`none`, `single`, `per_item`) with non-fatal offline printer warnings; verify API tests cover all print modes and template override/reset behavior.

## 7. React SPA & Unified Scanner UI

- [x] 7.1 Scaffold `web/` with React, TypeScript, Vite, Tailwind CSS v4, React Router, TanStack Query, and PWA manifest; configure Go `embed.FS` serving `web/dist` with SPA fallback and verify `npm run build` + `go build ./cmd/itemized` serves the UI cleanly.
- [x] 7.2 Implement Auth views (first-run Admin setup, Login with optional OIDC button) and main Inventory views (Products list with fuzzy search and stock/due/shopping-list filters, Product detail with items/variants/barcodes/print buttons, Categories tree, Locations tree with `is_freezer`).
- [x] 7.3 Build shared `<BarcodeScanner />` component (concurrent native `BarcodeDetector` + ZXing fallback, torch toggle, camera switcher, scan audio beep, USB/keyboard input) inside a unified Scanner drawer/page with `Purchase | Consume | Open | Transfer | Inventory` mode switcher preserving one live camera stream; verify component tests pass (`npm test`).
- [x] 7.4 Implement all 4 Scanner workflows on top of `<BarcodeScanner />` and `/api/scan/resolve`: flattened Purchase (Confirm & Add + expandable variant/second-barcode + UPC/LLM assist), Consume/Open (continuous scan + 5s Undo toast + inline unknown-barcode association), Transfer (sticky destination + Undo toast), and Inventory Audit (scan list + checkbox reconciliation summary + batch apply); verify workflow UI tests pass (`npm test`).
- [x] 7.5 Implement Settings UI (household user management for Admins, instance settings including `base_url` / `due_date_average_count` / OIDC / LLM config, Printer management + test print, and ZPL Label Template editor with variable reference and reset-to-default).

## 8. Companion Migration CLI (`itemized-migrate`)

- [x] 8.1 Implement `cmd/itemized-migrate` accepting `--pg-url`, `--sqlite`, and optional `--collection-id` (auto-selecting when 1 collection exists, listing choices and exiting non-zero when multiple exist), mapping all legacy Postgres tables into integer-keyed SQLite tables with full FK remapping (including hierarchical `parent_id`), populating `legacy_uuid` on `items`/`products`/`locations`, and copying `password_digest` -> `password_hash`.
- [x] 8.2 Add FTS5 index rebuild, `PRAGMA foreign_key_check`, and per-table row-count verification report to `itemized-migrate`; verify end-to-end migration test against a seeded test database confirms zero FK errors, matching counts, working bcrypt login, and working `/go/{i,p,l}/<legacy-uuid>` lookups (`go test ./cmd/itemized-migrate/...`).

## 9. Docker & Unraid Community Apps Packaging

- [x] 9.1 Create multi-stage `Dockerfile` (`node` build -> `CGO_ENABLED=0` Go build -> minimal runtime image exposing `8080`, `/data` volume, and `/up` healthcheck) and verify local `docker build` and container boot with persistent `/data/itemized.db`.
- [x] 9.2 Create `unraid/itemized.xml` Community Apps template mapping port `8080`, `/data` appdata mount, `BASE_URL`, `TZ`, and optional OIDC/LLM variables, plus concise self-hosting setup and migration docs in `README.md`; verify XML is well-formed and documented commands match actual flags/env vars.

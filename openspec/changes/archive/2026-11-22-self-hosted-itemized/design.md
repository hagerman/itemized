# Design

## Context

See [proposal.md](proposal.md) for motivation and capability scope. The existing Rails 8.1 application and Go companion print service live in `legacy/` as reference. This design defines the architecture, data model, API structure, and deployment layout for the self-hosted Go + React + SQLite application.

## Goals / Non-Goals

**Goals:**
- Single Go binary with embedded React SPA (`embed.FS`), zero external runtime dependencies (no Postgres, Redis, SMTP, or desktop print daemon).
- Pure-Go SQLite (`CGO_ENABLED=0`) for effortless `linux/amd64` and `linux/arm64` Docker builds.
- Mobile-ready REST API (`Cookie` + `Authorization: Bearer`) and OIDC support that avoids reverse-proxy session cookie conflicts (e.g., Pomerium).
- Full compatibility with existing printed QR codes (`/go/{i,p,l}/:id`) and legacy bcrypt password hashes via a companion Postgres-to-SQLite CLI.
- Pluggable direct LAN printing (IPP ZPL + Raw TCP `:9100`) with embedded default ZPL templates customizable in the Web UI.

**Non-Goals:**
- Multi-tenant / multi-collection hosting (single shared household inventory per instance).
- Building the native iOS/Android apps in this change (we only ensure the API and auth model support them cleanly).
- SMTP / email delivery for password resets or user invites.
- Reverse-proxy header authentication (deferred in favor of OIDC + Bearer tokens).

## Decisions

### 1. Monorepo & Binary Layout
```text
/
├── cmd/
│   ├── itemized/          # Main HTTP server + embedded web/dist
│   └── itemized-migrate/  # Companion Postgres -> SQLite CLI
├── internal/
│   ├── auth/              # bcrypt, sessions (cookie + Bearer), OIDC (PKCE)
│   ├── db/                # SQLite setup (WAL, FKs), embedded SQL migrations, FTS5
│   ├── api/               # HTTP router, JSON handlers, /go/{i,p,l}/:id redirects
│   ├── domain/            # Due-date calculation, measurements, shopping list logic
│   ├── printer/           # Driver interface (ipp_zpl, raw_tcp_zpl) + template engine
│   ├── upc/               # Stateless OpenFoodFacts HTTP client
│   └── llm/               # Optional classifier (Anthropic, OpenAI, Gemini, OpenAI-compat)
├── web/                   # React + TypeScript + Vite + Tailwind CSS + PWA
├── unraid/                # Unraid Community Apps XML template
├── Dockerfile             # Multi-stage build (node -> golang -> alpine/distroless)
└── legacy/                # Existing Rails + print service (kept for reference)
```
- **Rationale**: Keeping Go and React in one repo lets `go:embed` package `web/dist` directly into the binary and keeps API contract changes atomic.
- **Alternative considered**: Separate backend/frontend containers with Nginx. Rejected because Unraid users strongly prefer a single container with one port and one `/data` mount.

### 2. SQLite Engine & Schema (`modernc.org/sqlite`)
- **Decision**: Use pure-Go `modernc.org/sqlite` with `PRAGMA journal_mode=WAL`, `PRAGMA foreign_keys=ON`, `PRAGMA busy_timeout=5000`, and a single serialized writer pool (or `SetMaxOpenConns(1)` for writes) to avoid `SQLITE_BUSY` errors.
- **Fuzzy Search**: Replace Postgres `pg_trgm` with a SQLite **FTS5 virtual table** using `tokenize='trigram'` (`products_fts`) synced via SQLite triggers on `products` INSERT/UPDATE/DELETE.
- **Entity Schema (11 tables)**:
  - `users` (`id`, `email`, `password_hash`, `role`, `oidc_issuer`, `oidc_subject`, `created_at`, `updated_at`)
  - `sessions` (`id`, `user_id`, `token_hash`, `kind`, `user_agent`, `ip_address`, `expires_at`, `created_at`)
  - `settings` (`key` PK, `value`, `updated_at`)
  - `categories` (`id`, `name`, `parent_id`, `created_at`, `updated_at`)
  - `locations` (`id`, `legacy_uuid`, `name`, `parent_id`, `is_freezer`, `created_at`, `updated_at`)
  - `products` (`id`, `legacy_uuid`, `name`, `category_id`, `default_location_id`, `default_due_days`, `default_due_days_on_open`, `default_due_days_on_freeze`, `default_due_days_on_thaw`, `use_average_for_due_date`, `label_print_mode`, `minimum_value`, `manually_added_to_shopping_list`, `volume_value`, `volume_unit`, `weight_value`, `weight_unit`, `length_value`, `length_unit`, `created_at`, `updated_at`)
  - `variants` (`id`, `product_id`, `name`, `volume_value`, `volume_unit`, `weight_value`, `weight_unit`, `length_value`, `length_unit`, `created_at`, `updated_at`)
  - `barcodes` (`id`, `variant_id`, `barcode` UNIQUE, `default_quantity`, `created_at`, `updated_at`)
  - `items` (`id`, `legacy_uuid`, `product_id`, `variant_id`, `location_id`, `purchased_on_date`, `opened_on_date`, `due_on_date`, `consumed_on_date`, `notes`, `created_at`, `updated_at`)
  - `printers` (`id`, `name`, `description`, `driver`, `endpoint`, `printer_model`, `enabled`, `created_at`, `updated_at`)
  - `label_templates` (`entity_type` PK: `item` | `product` | `location`, `content`, `updated_at`)
- **Primary Keys & Legacy QR Support**: All entity tables use `INTEGER PRIMARY KEY` for compact URLs and lower-density, easier-to-scan QR codes on small thermal labels (`/go/i/1482`). `items`, `products`, and `locations` include a nullable `legacy_uuid TEXT` column with a unique partial index (`WHERE legacy_uuid IS NOT NULL`) so existing printed UUID labels continue resolving transparently. Dates are stored as ISO-8601 `YYYY-MM-DD` `TEXT`; timestamps as RFC3339 UTC `TEXT`.
- **Alternative considered**: `mattn/go-sqlite3` (CGO). Rejected to keep `CGO_ENABLED=0` cross-compilation fast and simple for multi-arch Docker images.

### 3. Authentication: Local + OIDC with Cookie & Bearer Sessions
- **Decision**: One `sessions` table stores SHA-256 hashes of random 32-byte tokens. Auth middleware checks `Authorization: Bearer <token>` first, then the `itemized_session` `HttpOnly` cookie.
- **OIDC**: Standard Authorization Code + PKCE using `coreos/go-oidc/v3` + `golang.org/x/oauth2`. Configured via `settings` or env vars (`OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`, `OIDC_AUTO_PROVISION`).
- **Rationale**: Allows placing Itemized behind Pomerium (with pass-through for `/api/*` or public route) without breaking future native iOS/Android clients that cannot carry Pomerium browser cookies.

### 4. Printing Engine & Templates
- **Decision**: Port `goipp` client and `text/template` helper functions from `legacy/itemized_print_service-main/internal/{printer,funcs}` into `internal/printer`.
- **Driver Interface**:
  ```go
  type Driver interface {
      Print(ctx context.Context, endpoint string, zpl []byte) error
      MediaReady(ctx context.Context, endpoint string) (string, error)
  }
  ```
  - `ipp_zpl`: Queries `OpGetPrinterAttributes` for `media-ready`, then posts `OpPrintJob` with `application/vnd.zebra-zpl`.
  - `raw_tcp_zpl`: Connects to `host:port` (default `:9100`) with timeout and writes raw ZPL bytes (`MediaReady` returns `""`).
- **Templates**: Embedded defaults in `internal/printer/templates/{item,product,location}.zpl` (preserving compatibility with existing template variables like `.Payload.ProductName`, `.Payload.Barcode`, `.Payload.DueDate`, `.MediaReady`). Any row in `label_templates` overrides the embedded default for that `entity_type`.

### 5. Scanning & Frontend Architecture
- **Decision**: React + TypeScript + Vite + Tailwind CSS v4 + React Router + TanStack Query.
- **Shared Scanner**: One `<BarcodeScanner />` component wrapping native `BarcodeDetector` + `@zxing/browser` concurrently, keeping one `MediaStream` alive across the `Purchase | Consume | Open | Transfer | Inventory` mode switcher.
- **Unified API**: `POST /api/scan/resolve` parses `/go/{i,p,l}/<id-or-uuid>` (any host), bare UUIDs, or retail barcodes and resolves numeric IDs against `id` and UUIDs against `legacy_uuid`, returning a typed union response. Continuous-scan mutations return the previous item state so the frontend's 5-second Undo toast can revert with a single `PATCH /api/items/:id`.

### 6. Companion Migration CLI (`itemized-migrate`)
- **Decision**: Standalone Go binary using `jackc/pgx/v5` (read-only from Postgres) and the same `internal/db` schema migrations (write to SQLite).
- **Mapping**:
  - Maintain in-memory `map[legacyUUID]int64` lookup tables per entity as rows are inserted in dependency order (`users`, `categories` top-down, `locations` top-down, `products`, `variants`, `barcodes`, `items`, `printers`), remapping all foreign keys to the new integer IDs.
  - `products`, `locations`, and `items` store their original Postgres UUID in `legacy_uuid` (lowercase) so previously printed QR labels remain valid.
  - `categories`, `locations`, `products`: drop `collection_id`, keep all other domain columns.
  - `product_variants` -> `variants`; `product_variant_barcodes` -> `barcodes` (drop `collection_id`); `product_items` -> `items` (`upc_items` is skipped).
  - `users`: copy `password_digest` -> `password_hash`; assign `admin` role to the collection owner and `member` to other migrated users; copy owner's `due_date_average_count` into `settings`.
  - `printers`: map `ip_address` -> `endpoint` (formatting IPP URL if bare IP), set `driver = 'ipp_zpl'`, `enabled = (status == 'active')`.

## Risks / Trade-offs

- **SQLite write contention during batch scans / imports** → Mitigated by `WAL` mode, `busy_timeout=5000`, and wrapping batch operations (Purchase multi-item create, Inventory Audit apply) in single transactions.
- **Direct IPP printing blocks HTTP request if printer is offline** → Mitigated by a short dial/request timeout (e.g. 5s) and returning non-fatal print warnings alongside created items so inventory mutations never fail just because the printer is powered off.
- **Unraid Docker networking for LAN printers** → Bridge mode on Unraid can reach LAN IPs directly on outbound connections (`http://192.168.x.x:631`), so host networking is not required; document printer IP reachability in the Unraid template notes.
- **Pure-Go SQLite (`modernc.org/sqlite`) performance vs CGO** → More than fast enough for household inventory (thousands to tens of thousands of rows) while eliminating CGO cross-compile complexity.

## Migration Plan

1. Deploy or run `itemized-migrate --pg-url "$LEGACY_PG_URL" --sqlite /mnt/user/appdata/itemized/itemized.db`.
2. Verify the CLI's row-count report and `PRAGMA foreign_key_check` pass with zero errors.
3. Start the Itemized Docker container on Unraid pointing `/data` to `/mnt/user/appdata/itemized` and setting `BASE_URL` to the desired domain.
4. Point existing domain/reverse proxy (or Pomerium route) to the container so phone-camera scans of `/go/{i,p,l}/:id` resolve directly.
5. Rollback: Legacy Postgres database is read-only during migration and remains completely untouched.

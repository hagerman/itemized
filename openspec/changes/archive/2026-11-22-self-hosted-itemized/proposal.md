# Proposal

## Why

Itemized currently runs as a hosted Ruby on Rails + PostgreSQL + Redis application with a separate Go desktop companion app solely to traverse home firewalls for Zebra label printing. Transitioning Itemized into a self-hosted, single-container Go + React + SQLite application allows anyone to run it easily on homelab platforms like Unraid while folding label printing directly into the server and preserving full compatibility with thousands of existing inventory records and printed QR labels.

## What Changes

- Introduce a self-hosted Go backend with an embedded React SPA (`embed.FS`) and embedded SQLite database (`WAL` mode + FTS5 trigram search), distributed as a multi-arch Docker image with an Unraid Community Apps template.
- Simplify the data model to a single shared household inventory (removing `collections` and `memberships`) with streamlined entity names: `Category`, `Location`, `Product`, `Variant`, `Barcode`, `Item`, `Printer`, `LabelTemplate`, `User`, `Session`, and `Setting`.
- Implement Admin-managed multi-user authentication supporting local email/password (bcrypt) and optional OIDC (Auth Code + PKCE), accepting both `HttpOnly` session cookies (web) and `Authorization: Bearer` tokens (future native iOS/Android clients) without reverse-proxy cookie conflicts.
- Fold Zebra label printing directly into the Go server with pluggable drivers (IPP ZPL for Zebra ZSB and Raw TCP `:9100` ZPL) and built-in ZPL templates (`item`, `product`, `location`) customizable in the Web UI.
- Provide full feature parity for all four scanning workflows (Purchase, Consume/Open, Transfer, Inventory Audit) with streamlined UX: one shared live camera/HID scanner across modes, a flattened Purchase flow, continuous-scan undo toasts, and a unified `POST /api/scan/resolve` endpoint.
- Preserve existing QR label compatibility (`/go/i/:id`, `/go/p/:id`, `/go/l/:id`) for both in-app host-agnostic scanning and direct HTTP redirects.
- Support OpenFoodFacts UPC lookup for unrecognized barcodes and opt-in LLM product classification (Anthropic, OpenAI, Gemini, or OpenAI-compatible/Ollama).
- Provide a companion `itemized-migrate` CLI tool to migrate historical data from the legacy PostgreSQL database into SQLite using compact integer primary keys while preserving legacy UUIDs (`legacy_uuid`) on `items`, `products`, and `locations` and preserving bcrypt password hashes.

## Capabilities

### New Capabilities
- `user-auth`: First-run Admin setup, Admin-managed household accounts, local bcrypt auth, optional OIDC, and dual cookie/Bearer token sessions.
- `inventory-catalog`: Single-household inventory data model (`Category`, `Location`, `Product`, `Variant`, `Barcode`, `Item`, `Setting`), due-date rules and averaging, measurements, shopping list, and SQLite FTS5 fuzzy search.
- `barcode-scanning`: Unified scan resolution API, legacy `/go/{i,p,l}/:id` QR routes, shared dual-engine camera/HID scanner, and streamlined Purchase, Consume/Open, Transfer, and Inventory Audit workflows.
- `web-ui`: Responsive React SPA and installable PWA with desktop sidebar + mobile bottom dock, status/tree filtering, product detail & bulk item management, category/location CRUD, keyboard shortcuts, and Settings views.
- `upc-and-classification`: Direct OpenFoodFacts barcode lookup for unrecognized barcodes and optional LLM product normalization and category matching.
- `label-printing`: Built-in direct label printing via pluggable drivers (IPP ZPL and Raw TCP `:9100`) and embedded default ZPL templates with UI-editable overrides (`LabelTemplate`).
- `legacy-migration`: Companion `itemized-migrate` CLI to import legacy PostgreSQL data into SQLite, remapping foreign keys to integer IDs while preserving `legacy_uuid` for existing QR labels, bcrypt password hashes, and FTS5 search indexes.
- `self-hosted-deployment`: Single-binary multi-arch Docker image, `/data` volume storage, `/up` healthcheck, and Unraid Community Apps XML template.

### Modified Capabilities
<!-- None — this repository has no existing OpenSpec capabilities. -->

## Impact

- New Go server (`cmd/itemized`, `internal/*`), companion migration CLI (`cmd/itemized-migrate`), React/Vite/Tailwind frontend (`web/`), `Dockerfile`, and Unraid template (`unraid/itemized.xml`) created at the repository root.
- Existing Rails application and Go print service remain untouched in `legacy/` as reference during development.
- Eliminates runtime dependencies on PostgreSQL, Redis, ActionCable, SMTP, and the desktop print companion app.

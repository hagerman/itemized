# demo-mode Specification

## Purpose

Provides an opt-in, zero-friction public demo runtime for Itemized with automatic administrator authentication bypass, deterministic sample household inventory seeding, periodic hourly resets, outbound network sandboxing, rate-limited UPC lookups, and a visible reset-countdown banner in the web UI.

## Requirements

### Requirement: Demo mode activation and interval configuration
The system SHALL activate demo mode when the `DEMO_MODE` environment variable is set to `true` (case-insensitive) and remain in standard authenticated mode otherwise. When demo mode is active, the system SHALL use `DEMO_RESET_INTERVAL` as the reset interval (parsed as a Go duration) and SHALL default to `1h` when unset or invalid.

#### Scenario: Standard mode when DEMO_MODE is unset or false
- **WHEN** the server starts with `DEMO_MODE` unset or set to `false`
- **THEN** normal authentication, setup, settings, printer, and persistence behaviors apply unchanged and `GET /api/auth/status` reports `demo_mode: false`

#### Scenario: Demo mode enabled with default interval
- **WHEN** the server starts with `DEMO_MODE=true` and `DEMO_RESET_INTERVAL` unset
- **THEN** the database is seeded on startup and the next reset boundary is aligned to the next 1-hour wall-clock boundary

#### Scenario: Demo mode enabled with custom interval
- **WHEN** the server starts with `DEMO_MODE=true` and `DEMO_RESET_INTERVAL=15m`
- **THEN** the next reset boundary is aligned to the next 15-minute wall-clock boundary

### Requirement: Automatic demo administrator authentication bypass
When demo mode is active, the system SHALL bypass login and first-run setup by automatically authenticating every request to protected `/api/*` endpoints and `/go/*` QR redirect routes as a seeded demo administrator account (`demo@itemizedapp.com`). `GET /api/auth/status` SHALL return `initialized: true`, `demo_mode: true`, `demo_reset_at` (RFC3339 UTC timestamp of the next scheduled reset), and the seeded demo administrator as `user`.

#### Scenario: Unauthenticated visitor opens the application in demo mode
- **WHEN** a browser with no session cookie calls `GET /api/auth/status` in demo mode
- **THEN** the server responds with HTTP 200 containing `demo_mode: true`, `demo_reset_at`, `initialized: true`, and `user` with role `admin`

#### Scenario: Unauthenticated API request succeeds as demo admin
- **WHEN** a client sends `GET /api/products` or `GET /api/settings` with no cookie or bearer token in demo mode
- **THEN** the server authorizes the request as the demo administrator and returns HTTP 200

#### Scenario: Unauthenticated QR redirect succeeds in demo mode
- **WHEN** a client requests `GET /go/p/{id}` with no session cookie in demo mode
- **THEN** the server redirects directly to `/products/{id}` instead of `/login`

#### Scenario: Auth mutation endpoints are disabled in demo mode
- **WHEN** a client calls `POST /api/auth/login`, `POST /api/auth/setup`, `POST /api/auth/logout`, `GET /api/auth/oidc/login`, `GET /api/auth/oidc/callback`, or `PATCH /api/auth/account` in demo mode
- **THEN** the server rejects the request with HTTP 403 and a clear demo-mode error message (or returns a no-op response for logout without clearing demo access)

### Requirement: Periodic database reset and deterministic relative-date seeding
When demo mode is active, the system SHALL reset the database to a clean seeded state on startup and whenever the current UTC time reaches or passes `demo_reset_at`. Reset checks SHALL execute lazily before handling incoming HTTP requests (synchronized so concurrent requests wait cleanly and only one reset runs per boundary) as well as via a background ticker, ensuring reliable resets even under serverless CPU throttling. All seeded item dates SHALL be computed relative to the current UTC date at reset time.

#### Scenario: Lazy reset triggered on first request after interval boundary
- **WHEN** a visitor modifies inventory data in demo mode and a request arrives at or after `demo_reset_at`
- **THEN** the system wipes and re-seeds the database in a single transaction before serving the request, advances `demo_reset_at` to the next interval boundary, and returns fresh seeded data

#### Scenario: Seeded dataset exercises core inventory views
- **WHEN** the demo database is seeded
- **THEN** it contains hierarchical locations (including at least one freezer), hierarchical categories, products with variants and barcodes, items across In Stock, Due Soon, Overdue, Opened, and Consumed states (supporting rolling-average due dates), products on the Shopping List via both low-stock thresholds and manual flagging, a sample printer, and demo household users

#### Scenario: Search index stays synchronized after reset
- **WHEN** the demo database resets and re-seeds
- **THEN** full-text trigram search (`GET /api/products?q=...`) immediately returns matching seeded products

### Requirement: Outbound network sandboxing for printers, OIDC, and LLM
When demo mode is active, the system SHALL prevent visitors from initiating arbitrary outbound network connections through printer, OIDC, or LLM configuration.

#### Scenario: Printer test and label printing do not open network connections
- **WHEN** a visitor triggers `POST /api/printers/{id}/test` or any `print-label` action in demo mode
- **THEN** the system performs no TCP or HTTP/IPP network I/O and returns a clear demo-mode notice indicating label printing is disabled in demo mode

#### Scenario: Label templates remain viewable and editable
- **WHEN** a visitor views or updates a label template via `/api/label-templates` in demo mode
- **THEN** template validation and persistence succeed normally until the next hourly reset

#### Scenario: OIDC and LLM settings are locked and disabled
- **WHEN** a visitor calls `PATCH /api/settings` with OIDC or LLM fields in demo mode
- **THEN** OIDC and LLM configuration values are not persisted, `GET /api/auth/status` reports `oidc_enabled: false`, `oidc_force: false`, and `llm_enabled: false`, and `POST /api/upc/classify` returns `enabled: false` without making outbound LLM calls

### Requirement: Rate-limited UPC lookup in demo mode
When demo mode is active, `POST /api/upc/lookup` SHALL remain enabled and SHALL enforce a rate limit of 5 requests per minute.

#### Scenario: UPC lookup within rate limit succeeds
- **WHEN** a visitor makes up to 5 calls to `POST /api/upc/lookup` within a 1-minute window in demo mode
- **THEN** the server processes the lookup normally

#### Scenario: UPC lookup exceeding rate limit returns HTTP 429
- **WHEN** more than 5 calls to `POST /api/upc/lookup` occur within a 1-minute window in demo mode
- **THEN** the server rejects the excess request with HTTP 429 and a descriptive rate-limit error message

### Requirement: Demo mode banner and UI adaptations
When `GET /api/auth/status` indicates `demo_mode: true`, the web UI SHALL display a persistent banner at the top of the application indicating demo mode and when the environment will next reset, and SHALL hide the Logout button.

#### Scenario: Demo banner displays reset countdown
- **WHEN** the web UI loads with `demo_mode: true` and a `demo_reset_at` timestamp
- **THEN** a top banner is visible across all pages displaying demo mode status and a live countdown (and/or reset time) until `demo_reset_at`

#### Scenario: Logout control is hidden in demo mode
- **WHEN** the web UI renders the navigation sidebar with `demo_mode: true`
- **THEN** the Logout button is not rendered

#### Scenario: UI refreshes data after reset boundary passes
- **WHEN** the client clock passes `demo_reset_at` while a visitor has the demo open
- **THEN** the frontend invalidates cached queries (including `auth-status`) so the banner updates to the new `demo_reset_at` and displayed inventory reflects the freshly reset dataset

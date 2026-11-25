# Design

## Context

See `proposal.md` for motivation and scope. Itemized is a single Go binary with an embedded React SPA (`web/dist`) and a single-connection SQLite database (`conn.SetMaxOpenConns(1)` in `internal/db/db.go`). It is designed to be hostable on Google Cloud Run, which uses an ephemeral container filesystem, scales to zero when idle, and throttles CPU between HTTP requests.

## Goals / Non-Goals

**Goals:**
- Support an opt-in `DEMO_MODE=true` runtime that requires zero code changes for standard self-hosted deployments.
- Guarantee hourly (or `DEMO_RESET_INTERVAL`) database resets even when Cloud Run throttles background goroutines between requests.
- Allow visitors to explore every UI view as an administrator without creating SSRF vectors (especially against GCP metadata `169.254.169.254`) or unbounded external API costs.
- Provide a rich, realistic household dataset whose `Due Soon`, `Overdue`, `Opened`, and `Shopping List` states never go stale over time.

**Non-Goals:**
- Cloud Run deployment manifests, Terraform, or CI/CD workflows.
- Per-visitor isolated databases (all visitors on an instance share the demo state until the next hourly reset).
- Customizing the seed dataset via external files or CLI flags.

## Decisions

### 1. Dedicated `internal/demo` package with lazy + ticker reset manager
- **Decision**: Create `internal/demo` containing `Manager` (tracks `interval`, `nextResetAt`, and a `sync.Mutex`) and `Seed(ctx, tx, now)`. Wrap `Server.Handler()` with a demo-reset middleware that calls `manager.EnsureFresh(r.Context())` before dispatching requests, plus an optional background ticker started from `cmd/itemized/main.go`.
- **Alignment**: Align `nextResetAt` to wall-clock boundaries via `now.UTC().Truncate(interval).Add(interval)` (e.g., `:00` each hour for `1h`).
- **In-place transactional reset**: Because `internal/db/db.go` enforces `SetMaxOpenConns(1)`, wiping all application tables (`product_merges`, `items`, `barcodes`, `variants`, `products`, `locations`, `categories`, `printers`, `label_templates`, `settings`, `sessions`, `users`) and re-seeding inside a single `BEGIN ... COMMIT` transaction (followed by `db.RebuildFTS`) is atomic, takes a few milliseconds, and avoids swapping `*sql.DB` handles across services.
- **Alternatives considered**:
  - *Baking a static `.db` file and copying it on reset*: Rejected because static dates would quickly turn all items overdue, and swapping SQLite files requires closing/reopening connections cleanly across active handlers.
  - *Pure `time.Ticker` without lazy request check*: Rejected because Cloud Run throttles CPU when no requests are in flight, which can delay or stall background tickers.

### 2. Auth bypass at middleware + status + QR redirect boundaries
- **Decision**: Add `DemoMode bool` and `DemoManager *demo.Manager` to `api.Server` (configured via `DEMO_MODE=true`). When enabled:
  - `GET /api/auth/status` returns `demo_mode: true`, `demo_reset_at: s.Demo.NextResetAt().Format(time.RFC3339)`, `initialized: true`, and the seeded demo admin user.
  - `auth.RequireAuth` (or a server-level wrapper around `authed`) looks up the seeded demo admin user (`demo@itemizedapp.com`) and injects it into `auth.WithAuth(ctx, user, nil)` without requiring cookies or bearer tokens.
  - `requireBrowserAuth` for `/go/i/{id}`, `/go/p/{id}`, `/go/l/{id}` returns `true` immediately.
  - Auth mutation handlers (`/api/auth/login`, `/api/auth/setup`, `/api/auth/logout`, `/api/auth/oidc/login`, `/api/auth/oidc/callback`, `/api/auth/account`) return HTTP `403` with `{"error":"disabled in demo mode"}` (except `/api/auth/logout`, which can also return `403` since the UI hides logout).
- **Alternatives considered**:
  - *Auto-issuing a real session cookie on first visit*: Adds unnecessary session-row churn and breaks when the hourly reset wipes the `sessions` table mid-browsing. Injecting the demo user per-request is completely stateless and survives hourly resets seamlessly.

### 3. Outbound network sandboxing & UPC rate limiting
- **Decision**:
  - **Printers**: In `handleTestPrinter`, return HTTP `403` with a clear message (`"printer testing is disabled in demo mode"`) before calling `s.Printer.Print`. In `printToActivePrinters`, return a single warning (`"label printing is disabled in demo mode"`) and skip all network I/O. Label template CRUD (`/api/label-templates`) remains fully functional.
  - **OIDC & LLM**: In `oidcConfig` and `llmConfig`, return empty/disabled configs when `DemoMode` is true. In `handleUpdateSettings`, strip or reject `oidc_*` and `llm_*` keys in demo mode so visitors cannot persist arbitrary URLs or keys; in `SettingsPage.tsx`, display a clear demo-mode note and disable the OIDC/LLM and Account forms.
  - **UPC Lookup**: Reuse the sliding-window limiter in `internal/api/ratelimit.go` (`newLoginRateLimiter(5, time.Minute)`, renamed or generalized to `rateLimiter`) on `Server.DemoUPCLimiter`. In `handleUPCLookup`, when `DemoMode` is true, check `Allow("ip:"+clientIP(r, s.TrustProxy))` and return HTTP `429` (`"UPC lookup rate limit exceeded (5 per minute in demo mode)"`) when exceeded.
- **Alternatives considered**:
  - *Member-only demo user*: Would hide Settings, Printers, and Label Templates from prospective users evaluating the app.

### 4. Demo banner and client-side reset refresh
- **Decision**: Extend `AuthStatus` in `web/src/api.ts` with `demo_mode?: boolean` and `demo_reset_at?: string`. Pass `demoMode` and `demoResetAt` from `App.tsx` into `Layout.tsx` and `SettingsPage.tsx`.
  - Render a compact, high-contrast amber/indigo banner across the top of `Layout.tsx` (visible on both desktop and mobile) showing `Demo Mode — Sample data resets in Xm (HH:MM)` using a 1-second/15-second `setInterval` ticker.
  - When `Date.now() >= Date.parse(demoResetAt)`, trigger `queryClient.invalidateQueries()` once for that boundary so the next API call triggers the server's lazy reset and refreshes all visible data and the next `demo_reset_at`.
  - Hide the Logout button in `Layout.tsx` when `demoMode` is true.

### 5. Deterministic household seed dataset
- **Decision**: Build a cohesive, realistic household inventory in `internal/demo/seed.go` with dates derived from `todayUTC`:
  - **Users**: `demo@itemizedapp.com` (`admin`) and `chris@itemizedapp.com` (`member`).
  - **Locations**: `Kitchen` (`Pantry`, `Refrigerator` → `Crisper Drawer`, `Freezer` [`is_freezer=1`]), `Garage` (`Chest Freezer` [`is_freezer=1`], `Storage Shelf`).
  - **Categories**: `Food` (`Pantry Staples`, `Dairy & Eggs`, `Produce`, `Frozen`), `Beverages`, `Household` (`Cleaning`, `Paper Goods`).
  - **Products (~12–15 products) with Variants, Barcodes, & Items**:
    - *In Stock*: Whole Grain Pasta (with variant & barcode), Extra Virgin Olive Oil, Canned Black Beans, Dish Soap, Frozen Berries (in Freezer), Ground Beef (in Chest Freezer).
    - *Due Soon* (due in +1 to +4 days): Whole Milk (opened, `default_due_days_on_open`), Baby Spinach, Greek Yogurt.
    - *Overdue* (due -2 to -3 days): Chicken Stock (opened), Fresh Salsa.
    - *Shopping List*: Paper Towels (`minimum_value=2`, 1 in stock → low stock), Sparkling Water (`minimum_value=4`, 2 in stock → low stock), Whole Bean Coffee (`manually_added_to_shopping_list=1`).
    - *Rolling Average Due Date*: Whole Milk or Eggs seeded with 3 historical consumed items (`consumed_on_date` set, `use_average_for_due_date=1`) so calculated due-date averaging is immediately visible.
  - **Sample Printer**: 1 disabled printer (`Kitchen Zebra ZSB`, `ipp_zpl`, `http://192.168.1.50:631/ipp/print`) so Settings displays a realistic printer configuration.

## Risks / Trade-offs

- **[Risk] Cloud Run cold starts reset data earlier than the 1-hour banner indicates** → Expected and acceptable for a public demo on ephemeral storage; the banner accurately reflects the guaranteed maximum lifetime before the next scheduled reset.
- **[Risk] A visitor deletes the `demo@itemizedapp.com` user or modifies it via admin user endpoints** → Guard `handleDeleteUser`, `handleUpdateUser`, and `handleResetUserPassword` in demo mode so the seeded `demo@itemizedapp.com` account cannot be deleted or demoted.
- **[Risk] `docker-entrypoint.sh` receives `DB_PATH=:memory:`** → Document using a normal path such as `/tmp/itemized-demo.db` or default `/data/itemized.db` (ephemeral tmpfs on Cloud Run) so `docker-entrypoint.sh` requires no risky changes.
- **[Risk] Per-IP UPC rate limit behind Cloud Run's reverse proxy** → Setting `TRUST_PROXY=true` on Cloud Run (already supported by `clientIP`) ensures per-visitor IP extraction; additionally, capping global demo UPC lookups or documenting `TRUST_PROXY=true` prevents shared-proxy collisions.

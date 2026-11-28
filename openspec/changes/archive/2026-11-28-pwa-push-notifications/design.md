# Design

## Context

See `proposal.md` for motivation and scope.

`itemized` is a single-binary pure-Go (`CGO_ENABLED=0`) server with SQLite (`modernc.org/sqlite`) and an embedded React/Vite SPA (`web/embed.go`). Today:
- `web/public/manifest.json` and `web/index.html` already configure an installable standalone PWA with iOS Home Screen meta tags, but there is no Service Worker.
- `internal/api/summary.go` already computes `due_soon`, `overdue`, and `shopping_list` product lists and counts.
- `Dockerfile` already installs `tzdata` on Alpine, so Go's `time.Local` honors the container's `TZ` environment variable.
- `cmd/itemized/main.go` already manages background lifecycle via `context.WithCancel` (used by `demo.Manager`), and `DEMO_MODE=true` sandboxes outbound network calls.

## Goals / Non-Goals

**Goals:**
- Zero-config self-hosted Web Push (auto-generated VAPID keys in SQLite `settings`, pure-Go RFC 8291/8292 delivery, works behind NAT with outbound HTTPS only).
- Clean separation between digest evaluation/scheduling and delivery channels so future channels (`ntfy`, webhooks, email, Apprise) plug in without changing preferences, scheduling, or deduplication.
- Restart-safe daily scheduling in the container's local timezone (`TZ`) with one configurable send time per user and separate notifications for expiration vs. shopping list.
- Minimal Service Worker (`web/public/sw.js`) with zero offline caching complexity.

**Non-Goals:**
- Implementing non-Web-Push channels (`ntfy`, email, webhooks) in this change (only designing the `Channel` interface and target schema to support them).
- Per-item real-time alerts, configurable days-of-week, or per-user timezone overrides (daily schedule in container `TZ` only).
- Offline SPA caching or Workbox precaching in the Service Worker.

## Decisions

### 1. Channel-agnostic `internal/notify` package
Create a dedicated `internal/notify` package with clear boundaries:
- **`Message`**: `{ Topic, Title, Body, URL, Tag }` — channel-neutral notification payload.
- **`Target`**: `{ ID, UserID, Channel, Label, ConfigJSON }` — persisted delivery endpoint owned by a user.
- **`Channel` interface**:
  ```go
  type Channel interface {
      Type() string // "web_push"
      Send(ctx context.Context, target Target, msg Message) error
  }
  ```
  Returning a sentinel `ErrTargetGone` (e.g., on HTTP `404`/`410`) tells the `Dispatcher` to delete the stale target automatically.
- **`Dispatcher`**: looks up the registered `Channel` by `target.Channel`, fans out `Send` across a user's targets, prunes `ErrTargetGone` targets, and updates `last_used_at` / `last_error`.
- **`Scheduler`**: runs a 1-minute ticker in `cmd/itemized/main.go` (skipped when `DEMO_MODE=true`), evaluates due users in `time.Local`, builds separate `Message`s for `expiration` and `shopping_list` using the same product/item due-soon and shopping-list rules as `internal/api/summary.go`, and dispatches via `Dispatcher`.

*Alternative considered*: Coupling Web Push calls directly inside `internal/api`. Rejected because it would tangle HTTP handlers with background scheduling and make adding `ntfy`/webhook channels later require rewriting storage and dispatch logic.

### 2. SQLite schema (`006_notifications.sql`)
Add two tables rather than adding many nullable columns to `users`:
- **`notification_preferences`**:
  - `user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE`
  - `digest_time TEXT NOT NULL DEFAULT '08:30'` (`HH:MM`, 24-hour)
  - `expiration_enabled INTEGER NOT NULL DEFAULT 0 CHECK (expiration_enabled IN (0, 1))`
  - `shopping_list_enabled INTEGER NOT NULL DEFAULT 0 CHECK (shopping_list_enabled IN (0, 1))`
  - `expiration_last_sent_date TEXT` (`YYYY-MM-DD` in container local time)
  - `shopping_list_last_sent_date TEXT` (`YYYY-MM-DD` in container local time)
  - `updated_at TEXT NOT NULL`
- **`notification_targets`**:
  - `id INTEGER PRIMARY KEY`
  - `user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE`
  - `channel TEXT NOT NULL CHECK (channel IN ('web_push'))`
  - `label TEXT NOT NULL DEFAULT ''`
  - `config_json TEXT NOT NULL` (for `web_push`: `{"endpoint":"...","p256dh":"...","auth":"..."}`)
  - `dedupe_key TEXT NOT NULL` (SHA-256 of the push endpoint for `web_push`; `UNIQUE(user_id, channel, dedupe_key)`)
  - `created_at TEXT NOT NULL`
  - `last_used_at TEXT`
  - `last_error TEXT`

*Alternative considered*: Storing preferences as extra columns on `users` and a `web_push_subscriptions` table. Rejected because `notification_targets` with `channel` + `config_json` directly supports future channels without new tables, and keeping `notification_preferences` separate avoids bloating `users` queries and auth payloads.

### 3. Pure-Go Web Push library & auto-generated VAPID keys
Use `github.com/SherClockHolmes/webpush-go` (pure Go, compatible with `CGO_ENABLED=0` multi-arch Alpine builds) for VAPID JWT signing and RFC 8291 payload encryption.
- On first access (`EnsureVAPIDKeys`), check `settings` for `vapid_public_key` and `vapid_private_key`; if absent, generate via `webpush.GenerateVAPIDKeys()` and persist in `settings` inside a transaction.
- Use `mailto:noreply@itemized.local` (or derive from `base_url` host when configured) as the VAPID `Subscriber` claim required by Apple/Google push services.

*Alternative considered*: Implementing RFC 8291/8292 cryptographic framing from scratch. Rejected as unnecessary security/interoperability risk when a small, battle-tested pure-Go library exists.

### 4. Scheduler timing and restart-safe deduplication
- Tick every 1 minute using `time.Now()` (which respects container `TZ`).
- For each user with at least one enabled digest and at least one target:
  - Format `today := now.Format("2006-01-02")` and `hhmm := now.Format("15:04")`.
  - A digest is due when `hhmm >= pref.DigestTime` AND `last_sent_date != today`.
  - To avoid blasting a stale morning digest if a container was powered off for 12 hours and booted at midnight, cap catch-up to a reasonable grace window (e.g., within 2 hours of `digest_time`), or if a user changes `digest_time` to a time already passed today, don't retroactively fire if `last_sent_date == today`.
  - Record `last_sent_date = today` once evaluation succeeds (even if the digest was empty and skipped, so the evaluator doesn't re-query every minute for the rest of the day).
  - *Note*: If the user edits `digest_time` to a later time today, we can keep `last_sent_date` as-is (won't double-send today; new time takes effect tomorrow).

### 5. Minimal Service Worker (`web/public/sw.js`)
Place a plain JS file at `web/public/sw.js` (copied verbatim into `web/dist/sw.js` by Vite and served at `/sw.js` from `web/embed.go` with root scope `/`).
- Handles only `push` (parses JSON `{title, body, url, tag}`, calls `self.registration.showNotification(...)` with `/icon-192.png`) and `notificationclick` (closes notification, focuses an existing same-origin client window and navigates it to `url`, or calls `clients.openWindow(url)`).
- Explicitly does **not** attach a `fetch` event listener, avoiding stale SPA asset caching bugs.
- Serve `/sw.js` with `Cache-Control: no-cache` in `internal/api` static handler so browsers always pick up Service Worker updates promptly.

### 6. Digest payload formatting
Keep payloads concise for mobile lock screens:
- **Expiration**:
  - Title: `"Itemized: Expiring Soon"` (or `"Itemized: Overdue Items"` when overdue > 0)
  - Body: e.g., `"2 overdue, 3 due soon: Milk, Spinach, Chicken (+2 more)"`
  - URL: `"/?status=overdue"` if overdue > 0, else `"/?status=due_soon"`
  - Tag: `"itemized-expiration"`
- **Shopping List**:
  - Title: `"Itemized: Shopping List"`
  - Body: e.g., `"4 items needed: Eggs, Olive Oil, Coffee (+1 more)"`
  - URL: `"/?status=shopping_list"`
  - Tag: `"itemized-shopping-list"`

## Risks / Trade-offs

- **[Risk] iOS Safari users try to enable push from a regular browser tab** → Detect iOS non-standalone mode (`!window.matchMedia('(display-mode: standalone)').matches` and iOS UA) in Settings and display clear step-by-step instructions (`Share -> Add to Home Screen`) rather than an error.
- **[Risk] Self-hosters running plain HTTP on LAN cannot enroll** → Detect `!window.isSecureContext` in Settings and show a concise explanation that HTTPS (e.g., reverse proxy, Tailscale HTTPS, or Cloudflare Tunnel) is required by browsers for Web Push.
- **[Risk] Push service endpoints become stale after app uninstall or permission revoke** → Treat HTTP `404`/`410` from push services as `ErrTargetGone` and delete the target row automatically.
- **[Risk] Container `TZ` unset defaults to UTC** → Document setting `TZ` (e.g., `TZ=America/New_York`) in the Settings UI hint (displaying the server's current timezone name alongside the time picker so users immediately see what timezone `digest_time` uses).
- **[Risk] Demo mode could be abused to send outbound HTTP requests** → Completely skip starting the scheduler and reject target enrollment / test sends with HTTP `403` when `DEMO_MODE=true`.

## Migration Plan

1. Add `internal/db/migrations/006_notifications.sql` (additive tables only; zero downtime or destructive changes).
2. Existing deployments auto-apply the migration on startup; VAPID keys are generated lazily on first use.
3. Rollback is straightforward: removing the binary/UI leaves the unused tables harmlessly in SQLite.

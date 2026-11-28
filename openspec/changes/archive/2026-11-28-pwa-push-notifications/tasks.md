# Tasks

## 1. Database Schema and Dependencies

- [x] 1.1 Add `github.com/SherClockHolmes/webpush-go` to `go.mod` and verify `go build ./...` succeeds with `CGO_ENABLED=0`
- [x] 1.2 Add SQLite migration `internal/db/migrations/006_notifications.sql` creating `notification_preferences` and `notification_targets` tables with indexes and foreign-key cascades, and verify `go test ./internal/db/...` passes on fresh and migrated databases

## 2. Core Notification Subsystem (`internal/notify`)

- [x] 2.1 Implement `internal/notify` core types (`Message`, `Target`, `Preferences`, `Channel` interface, `ErrTargetGone`), SQLite store helpers, and auto-generated VAPID key persistence in `settings`; verify with unit tests covering VAPID idempotency, preference defaults/updates, and target upsert/delete scoping
- [x] 2.2 Implement `WebPushChannel` (RFC 8291/8292 delivery via `webpush-go` and `404`/`410` mapping to `ErrTargetGone`) and `Dispatcher` fan-out with automatic stale-target pruning; verify with unit tests using an `httptest` mock push server
- [x] 2.3 Implement digest formatting and `Scheduler` (daily container-`TZ` evaluation, separate expiration and shopping-list messages, empty-digest skipping, grace window, and restart-safe `last_sent_date` deduplication); verify with unit tests using an injectable clock and mock channel

## 3. HTTP API and Server Wiring

- [x] 3.1 Add authenticated `/api/notifications/config`, `/api/notifications/preferences`, `/api/notifications/targets`, `/api/notifications/targets/{id}`, and `/api/notifications/test` handlers in `internal/api` (including `HH:MM` validation, per-user isolation, `DEMO_MODE` `403` blocking, and `Cache-Control: no-cache` for `/sw.js`), and verify with `go test ./internal/api/...` covering all scenarios
- [x] 3.2 Wire `notify.Scheduler` startup and graceful shutdown in `cmd/itemized/main.go` (skipped when `DEMO_MODE=true`), and verify `go build ./cmd/itemized` succeeds

## 4. PWA Service Worker and Settings UI

- [x] 4.1 Create minimal `web/public/sw.js` handling `push` and `notificationclick` deep links (without `fetch` caching) and register `/sw.js` in `web/src/main.tsx`; verify Vite build outputs `web/dist/sw.js`
- [x] 4.2 Add notification API client functions in `web/src/api.ts` and a **Notifications** card in `web/src/pages/SettingsPage.tsx` (device enroll/unenroll, enrolled device list, **Send Test Notification** button, independent expiration and shopping-list toggles, daily `digest_time` picker with server timezone display, demo-mode notice, and iOS Home Screen / HTTPS inline guidance); verify with Vitest unit tests (`npm --prefix web test`) and `npm --prefix web run build`

## 5. Final Verification

- [x] 5.1 Run `go test ./...`, `go vet ./...`, and `gopls check` on Go files, plus `npm --prefix web test` and `npm --prefix web run build`, and confirm all checks pass with zero errors
- [x] 5.2 Verify `internal/docsverify` tests pass (updating API/package documentation if required by `internal/docsverify`)

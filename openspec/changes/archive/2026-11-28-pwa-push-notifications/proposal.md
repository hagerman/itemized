# Proposal

## Why

Household members using `itemized` as a self-hosted PWA currently have to remember to open the app—or configure an external Home Assistant REST polling automation—to learn when food is about to expire or when the shopping list needs attention. Adding native Web Push notifications lets iOS and Android PWA users receive timely daily digests directly on their devices with zero third-party accounts, relay services, or developer fees.

## What Changes

- **Channel-agnostic notification subsystem (`internal/notify`)**: Introduce a `Channel` abstraction, digest evaluator, dispatcher, and background scheduler in Go, starting with a `web_push` (VAPID, RFC 8291/8292) channel while keeping the model ready for future delivery channels (such as `ntfy`, webhooks, or email).
- **Zero-config VAPID key management**: Automatically generate and persist an ECDSA P-256 VAPID keypair in SQLite `settings` on first use so self-hosted deployments require no external credentials.
- **Per-user notification preferences and device targets**: Add SQLite tables for per-user daily digest preferences (single configurable daily time of day in the container's `TZ`, independent toggles for **Expiring & Overdue** and **Shopping List / Low Stock** digests, and restart-safe `last_sent_date` tracking) and per-user delivery targets (multiple enrolled devices per user, automatic cleanup on `404`/`410 Gone`).
- **Separate daily digest notifications**: Send up to two distinct daily notifications per user—one for expiring/overdue items and one for shopping list / low-stock items—skipping any digest whose count is zero, with deep links back to the matching inventory view (`/?status=overdue`, `/?status=due_soon`, or `/?status=shopping_list`).
- **Notification API endpoints**: Add authenticated per-user endpoints to retrieve the VAPID public key, manage enrolled push targets, update digest preferences, and trigger a test notification (disabled in `DEMO_MODE`).
- **Minimal PWA Service Worker and Settings UI**: Add a lightweight `web/public/sw.js` (`push` and `notificationclick` only, no offline fetch caching), register it in the React app, and add a **Notifications** card to Settings with device enrollment/removal, a **Send Test Notification** action, digest toggles, daily time picker, and helpful guidance for iOS Home Screen installation and HTTPS requirements.

## Capabilities

### New Capabilities
- `push-notifications`: Per-user daily digest push notifications for expiring/overdue items and shopping list / low-stock items, delivered via PWA Web Push (VAPID) through an extensible multi-channel notification architecture.

### Modified Capabilities
<!-- None: existing web-ui and demo-mode requirements remain unchanged; push-notification UI and demo-mode disabling are specified under push-notifications. -->

## Impact

- **Backend (Go)**: New `internal/notify` package, new SQLite migration (`006_notifications.sql`), new `/api/notifications/*` routes in `internal/api`, scheduler startup/shutdown wired in `cmd/itemized/main.go`, and a pure-Go Web Push dependency (compatible with `CGO_ENABLED=0`).
- **Frontend (React/Vite)**: New `web/public/sw.js`, Service Worker registration in `web/src/main.tsx`, notification API client methods in `web/src/api.ts`, and a new Notifications card in `web/src/pages/SettingsPage.tsx`.
- **Operations / Self-Hosting**: Uses existing container `TZ` (Alpine `tzdata` already installed in `Dockerfile`). Requires HTTPS (or `localhost`) for browser push enrollment and outbound HTTPS from the server to vendor push endpoints (Apple APNs, Google FCM, Mozilla Autopush); no inbound internet exposure required.

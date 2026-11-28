# push-notifications Specification

## Purpose

Delivers per-user daily digest push notifications to iOS, Android, and desktop PWA clients for expiring/overdue items and shopping list / low-stock items using Web Push (VAPID), built on an extensible multi-channel notification model.

## Requirements

### Requirement: Automatic VAPID key initialization and public key exposure
The system SHALL automatically generate and persist a VAPID keypair when none exists so self-hosted deployments require no external push credentials, and SHALL expose only the public VAPID key to authenticated users via `GET /api/notifications/config`.

#### Scenario: First-time VAPID key generation
- **WHEN** an authenticated user requests `GET /api/notifications/config` on a fresh instance with no stored VAPID keys
- **THEN** the system generates and persists a VAPID keypair and returns the URL-safe base64 public key
- **AND** subsequent requests return the same persisted public key without exposing the private key

### Requirement: Per-user notification preferences
Each authenticated user SHALL be able to retrieve (`GET /api/notifications/preferences`) and update (`PATCH /api/notifications/preferences`) their own daily digest settings, consisting of a single daily send time (`digest_time` in 24-hour `HH:MM` format, defaulting to `08:30`) and independent boolean toggles for `expiration_enabled` and `shopping_list_enabled` (both defaulting to `false`).

#### Scenario: User updates their digest preferences
- **WHEN** an authenticated user submits `PATCH /api/notifications/preferences` with `{"digest_time": "09:15", "expiration_enabled": true, "shopping_list_enabled": true}`
- **THEN** the system persists those preferences for that user only and returns the updated preferences
- **AND** other users' notification preferences remain unchanged

#### Scenario: Invalid digest time is rejected
- **WHEN** an authenticated user submits `PATCH /api/notifications/preferences` with `digest_time` not matching valid 24-hour `HH:MM` (e.g., `"25:99"` or `"8:30 AM"`)
- **THEN** the system responds with HTTP `422` and does not modify stored preferences

### Requirement: Per-user push target enrollment and management
Each authenticated user SHALL be able to register (`POST /api/notifications/targets`), list (`GET /api/notifications/targets`), and delete (`DELETE /api/notifications/targets/{id}`) their own notification delivery targets. Re-registering the same Web Push endpoint for the same user SHALL update the existing target idempotently rather than creating duplicates.

#### Scenario: User enrolls a Web Push device
- **WHEN** an authenticated user submits a valid `web_push` target (`endpoint`, `p256dh`, `auth`, and optional `label`) to `POST /api/notifications/targets`
- **THEN** the system persists the target associated with that user and returns the created target summary (without exposing raw encryption keys in list responses)

#### Scenario: User cannot delete another user's target
- **WHEN** User A sends `DELETE /api/notifications/targets/{id}` for a target owned by User B
- **THEN** the system responds with HTTP `404` and does not delete User B's target

#### Scenario: Stale Web Push endpoint is automatically pruned
- **WHEN** delivering a notification to a `web_push` target receives HTTP `404` or `410` from the push service
- **THEN** the system removes that target from storage so future digests do not retry the dead endpoint

### Requirement: Separate daily digest notifications for expiration and shopping list
The system SHALL evaluate daily digests using the container's local timezone (`TZ`) once the current local time reaches or passes a user's `digest_time`, sending up to two separate notifications per user when non-empty: an expiration digest (for overdue or due-soon products, deep-linking to `/?status=overdue` or `/?status=due_soon`) and a shopping list digest (for products on the shopping list, deep-linking to `/?status=shopping_list`).

#### Scenario: Both digests fire as separate notifications when both have items
- **WHEN** a user has at least one enrolled target, `digest_time` is `08:30`, both `expiration_enabled` and `shopping_list_enabled` are `true`, the local clock reaches `08:30`, and there are 2 due-soon items and 3 shopping-list products
- **THEN** the system dispatches two separate notifications (one for expiration and one for shopping list) to all of that user's targets

#### Scenario: Empty digest is skipped
- **WHEN** a user's `expiration_enabled` is `true` and `shopping_list_enabled` is `true`, and at `digest_time` there are 0 overdue and 0 due-soon items but 2 shopping-list products
- **THEN** the system skips the expiration notification and sends only the shopping list notification

#### Scenario: Restart-safe deduplication prevents duplicate same-day sends
- **WHEN** a user's expiration digest has already been sent for today's local date and the server restarts later the same day
- **THEN** the system does not send a second expiration digest for that user on the same local date

#### Scenario: User with no enrolled targets is skipped
- **WHEN** a user has `expiration_enabled = true` but zero enrolled targets
- **THEN** the system does not attempt delivery or fail the scheduler loop

### Requirement: On-demand test notification
An authenticated user SHALL be able to trigger `POST /api/notifications/test` to send a sample notification immediately to all of their enrolled targets so they can verify end-to-end delivery on their device.

#### Scenario: Test notification succeeds for enrolled user
- **WHEN** an authenticated user with at least one enrolled target calls `POST /api/notifications/test`
- **THEN** the system dispatches a test notification to each of the user's targets and returns delivery results (`sent`, `failed`, `pruned`)

#### Scenario: Test notification with no enrolled targets
- **WHEN** an authenticated user with no enrolled targets calls `POST /api/notifications/test`
- **THEN** the system responds with HTTP `422` explaining that no devices are enrolled

### Requirement: PWA Service Worker push handling and Settings UI
The web application SHALL register a minimal Service Worker (`/sw.js`) that displays incoming push payloads and opens or focuses the payload's deep-link URL on click without caching fetch requests. The Settings page (for all authenticated roles) SHALL provide a **Notifications** card for device enrollment/removal, test sends, digest toggles, daily `digest_time` selection, and inline guidance for non-HTTPS origins or iOS Safari tabs outside the Home Screen.

#### Scenario: Clicking a push notification opens the matching view
- **WHEN** the user taps a delivered expiration push notification whose payload URL is `/?status=due_soon`
- **THEN** the Service Worker focuses an existing `itemized` window (navigating it to `/?status=due_soon`) or opens a new window at `/?status=due_soon`

#### Scenario: iOS Safari outside Home Screen shows install guidance
- **WHEN** a user opens Settings in mobile Safari on iOS without launching from the Home Screen
- **THEN** the Notifications card displays instructions to add `itemized` to the Home Screen before enabling push notifications instead of a broken toggle

#### Scenario: Plain HTTP origin shows HTTPS requirement notice
- **WHEN** a user opens Settings over a non-secure origin (neither HTTPS nor `localhost`)
- **THEN** the Notifications card disables device enrollment and explains that HTTPS is required for PWA push notifications

### Requirement: Demo mode isolation
When `DEMO_MODE=true`, the background notification scheduler SHALL NOT start, and mutating or outbound notification endpoints (`POST /api/notifications/targets`, `DELETE /api/notifications/targets/{id}`, `POST /api/notifications/test`) SHALL be disabled (returning HTTP `403`), with the Settings UI reflecting that push notifications are disabled in demo mode.

#### Scenario: Outbound push is blocked in demo mode
- **WHEN** `DEMO_MODE=true` and a client calls `POST /api/notifications/test` or `POST /api/notifications/targets`
- **THEN** the system responds with HTTP `403` and performs no outbound network requests

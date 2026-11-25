# Proposal

## Why

Prospective users currently have to deploy Itemized locally and complete first-run admin setup before they can try the application. Adding a built-in demo mode makes it possible to host a public, zero-friction demo instance (such as on Google Cloud Run) that opens straight into a realistic household inventory and automatically resets itself every hour.

## What Changes

- Add an opt-in `DEMO_MODE=true` runtime mode (with optional `DEMO_RESET_INTERVAL`, defaulting to `1h`) that seeds a realistic household inventory dataset and resets the database on interval boundaries aligned to the top of the hour.
- Bypass authentication in demo mode by automatically authenticating API requests, `/api/auth/status`, and `/go/*` QR redirects as a seeded demo administrator account (`demo@itemizedapp.com`), while disabling auth mutation endpoints (`/api/auth/login`, `/api/auth/setup`, `/api/auth/logout`, `/api/auth/oidc/*`, `/api/auth/account`).
- Sandbox outbound network actions in demo mode so public visitors cannot trigger SSRF or API abuse:
  - Disable outbound printer network calls (`print-label` and printer test endpoints return friendly demo notices instead of opening TCP/IPP connections), while keeping label template viewing and editing available.
  - Lock and disable OIDC and LLM instance settings so outbound OIDC discovery and LLM requests cannot be configured or triggered.
  - Keep `POST /api/upc/lookup` enabled in demo mode, rate-limited to 5 requests per minute (returning HTTP 429 when exceeded).
- Expose `demo_mode` and `demo_reset_at` from `GET /api/auth/status`, render a top demo banner in the web UI showing when the environment resets (with a live countdown and automatic data refresh after reset), and hide the Logout control in demo mode.

## Capabilities

### New Capabilities
- `demo-mode`: Opt-in public demo runtime with automatic admin auth bypass, deterministic relative-date household seeding, periodic hourly database resets, outbound network sandboxing, UPC lookup rate limiting, and a UI reset-countdown banner.

### Modified Capabilities
<!-- None — standard non-demo behavior is unchanged. -->

## Impact

- **Backend**: `cmd/itemized/main.go`, new `internal/demo` (seeding and reset manager), `internal/api/server.go`, `internal/api/workflows.go`, `internal/api/ratelimit.go`, and `internal/auth/auth.go`.
- **Frontend**: `web/src/api.ts`, `web/src/App.tsx`, `web/src/components/Layout.tsx`, and `web/src/pages/SettingsPage.tsx`.
- **Docs**: `README.md` environment variables table (`DEMO_MODE`, `DEMO_RESET_INTERVAL`).
- **Tests**: Unit and integration tests in Go (`internal/demo`, `internal/api`) and Vitest (`web/src/components/Layout.test.tsx`).

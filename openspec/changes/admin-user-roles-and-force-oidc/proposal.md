# Proposal

## Why

Household administrators currently have no way in the Settings UI to promote an existing member to administrator or demote an administrator back to a member (even though `PATCH /api/users/{id}` exists on the backend without self-demotion or last-admin safeguards). Additionally, self-hosted deployments using an OIDC identity provider (such as Authelia, Authentik, or Pocket ID) cannot enforce OIDC-only authentication—users still see the local password form and can authenticate via `POST /api/auth/login` instead of being redirected directly to the IdP.

## What Changes

- **Admin user role management**:
  - Expose role promotion/demotion controls (`member` ↔ `admin`) per user in the Settings → Household Users (Admin) UI using `PATCH /api/users/{id}`.
  - Add backend safeguards on `PATCH /api/users/{id}` so an administrator cannot change their own role and cannot demote the last remaining administrator.
- **Force OIDC authentication**:
  - Add an `oidc_force` instance setting (persisted in `settings`, with `OIDC_FORCE` environment variable fallback, defaulting to `false`) exposed in `GET /api/settings`, `PATCH /api/settings`, and `GET /api/auth/status`.
  - Reject enabling `oidc_force` via `PATCH /api/settings` when OIDC is not configured (`oidc_issuer` and `oidc_client_id` must be present).
  - When OIDC is configured and `oidc_force` is enabled, reject all non-OIDC login attempts on `POST /api/auth/login` (both cookie and bearer modes) with HTTP 403.
  - When an unauthenticated user lands on the login screen on an initialized instance with `oidc_force` active, automatically redirect them to `/api/auth/oidc/login` (and do not render the local email/password login form).
  - Add a "Force OIDC login (disable local password sign-in)" checkbox under Settings → Instance Configuration → OIDC, and disable both the "Auto-provision new household members on OIDC login" and "Force OIDC login" checkboxes unless OIDC issuer and client ID are configured.
  - Document `OIDC_FORCE` in `README.md`.

## Capabilities

### New Capabilities
<!-- None: all changes extend existing user-auth and web-ui capabilities. -->

### Modified Capabilities
- `user-auth`: Add admin role modification safeguards (prevent self-role change and last-admin demotion) and add the `oidc_force` mode that blocks local password authentication on `POST /api/auth/login` when OIDC is configured and forced.
- `web-ui`: Add role selection controls to Household Users in Settings, add the Force OIDC configuration toggle in Instance Configuration, and auto-redirect unauthenticated visitors on the login screen to `/api/auth/oidc/login` while hiding local password login when Force OIDC is active.

## Impact

- **Backend**: `internal/auth/auth.go`, `internal/auth/oidc.go`, `internal/api/server.go`, plus unit/API tests in `internal/auth/auth_test.go` and `internal/api/api_test.go`.
- **Frontend**: `web/src/api.ts`, `web/src/App.tsx`, `web/src/pages/AuthPage.tsx`, `web/src/pages/SettingsPage.tsx`, plus Vitest coverage in `web/src/pages/SettingsPage.test.tsx` and a new `web/src/pages/AuthPage.test.tsx`.
- **Docs**: `README.md` environment variable reference (`OIDC_FORCE`).
- **Database**: No schema migration required; uses the existing `settings` key/value table (`oidc_force`) and `users.role` column.

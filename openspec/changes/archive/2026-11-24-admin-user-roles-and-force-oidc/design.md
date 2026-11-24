# Design

## Context

See `proposal.md` for motivation and scope.

Current state in the codebase:
- `PATCH /api/users/{id}` (`Server.handleUpdateUser` in `internal/api/server.go`) already exists and calls `auth.Service.UpdateUserRole(ctx, id, role)`, but neither the handler nor `UpdateUserRole` prevents self-role modification or demoting the last remaining `admin`.
- `web/src/pages/SettingsPage.tsx` renders each household user with a static role badge and a delete button (hidden for `u.id === user.id`), with no UI control to change roles.
- OIDC settings (`oidc_issuer`, `oidc_client_id`, `oidc_client_secret`, `oidc_auto_provision`) are stored in the `settings` table with `OIDC_*` env var fallbacks via `Server.getSetting` and read into `auth.OIDCConfig` in `Server.oidcConfig`.
- `GET /api/auth/status` returns `{ initialized, oidc_enabled, user }`, and `web/src/App.tsx` renders `AuthPage` whenever `!authStatus.user`.

## Goals / Non-Goals

**Goals:**
- Provide safe, atomic role promotion/demotion (`member` ↔ `admin`) in both the backend API and the Settings UI.
- Enforce OIDC-only login end-to-end when `oidc_force` is enabled: block `POST /api/auth/login` on the server and automatically redirect unauthenticated browser visits to `/api/auth/oidc/login` without exposing the local login form.
- Prevent accidental admin lockout when toggling `oidc_force` or clearing OIDC settings.

**Non-Goals:**
- Changing OIDC IdP protocol behavior (PKCE, scopes, or claim mapping) or adding IdP-driven group/role sync.
- Disabling `POST /api/auth/setup` when zero users exist (first-run setup still applies on an empty database).
- Adding a separate "local break-glass login URL" bypass (the user explicitly requested disallowing non-OIDC login when Force OIDC is enabled; admins can always disable it via SQLite `settings` or env var if an IdP goes down).

## Decisions

### 1. Self-role change & last-admin safeguards on `PATCH /api/users/{id}`
- **Decision**:
  - In `handleUpdateUser`, reject requests where `current := auth.UserFromContext(r.Context()); current != nil && current.ID == id` with HTTP 422 (`"cannot change your own role"`), matching the existing `handleDeleteUser` pattern.
  - In `auth.Service.UpdateUserRole`, run the update inside a database transaction: check the target user's current role, and if changing from `admin` to `member`, verify `SELECT COUNT(1) FROM users WHERE role = 'admin'` is greater than 1; otherwise return a new sentinel error `auth.ErrLastAdmin` (mapped to HTTP 422 `"cannot demote the last administrator"`).
- **Rationale**: Prevents accidental loss of admin privileges both from the UI and from direct API calls, even under concurrent requests.
- **Alternative considered**: Only hiding the UI control for self. Rejected because direct API calls could still demote the last admin.

### 2. Force OIDC configuration & effective state (`oidc_force` / `OIDC_FORCE`)
- **Decision**:
  - Add `Force bool` to `auth.OIDCConfig` with a helper method `func (c OIDCConfig) ForceActive() bool { return c.Enabled() && c.Force }`.
  - Load `Force` in `Server.oidcConfig` via `strings.EqualFold(s.getSetting(ctx, "oidc_force", "OIDC_FORCE", "false"), "true")`.
  - In `handleUpdateSettings`:
    - Add `"oidc_force": true` to the `allowed` settings map.
    - Compute the effective post-update `oidc_issuer`, `oidc_client_id`, and `oidc_force` values before writing:
      - If the request explicitly sets `oidc_force` to `"true"` / `true` while the resulting `oidc_issuer` or `oidc_client_id` would be empty, reject with HTTP 422 (`"configure OIDC issuer and client ID before forcing OIDC"`).
      - If the request clears `oidc_issuer` or `oidc_client_id` (resulting in OIDC being disabled) and `oidc_force` was not rejected, automatically persist `oidc_force = "false"` so stale DB state cannot silently re-enable Force OIDC later.
  - Note on `getSetting`: `getSetting` currently treats empty string in DB as "fall back to env var". Keeping `oidc_force` stored explicitly as `"true"` or `"false"` (identical to `oidc_auto_provision`) ensures an explicit DB `"false"` overrides `OIDC_FORCE=true` cleanly.
- **Rationale**: Mirrors the exact pattern of `oidc_auto_provision` with zero schema migrations and prevents inconsistent states where Force OIDC is toggled on without a configured IdP.

### 3. Enforcing Force OIDC on the backend (`POST /api/auth/login`)
- **Decision**:
  - At the start of `handleAuthLogin` (before credential verification and session creation), check `if s.oidcConfig(r.Context(), r).ForceActive()`. If true, respond with HTTP 403 (`"local password login is disabled; sign in with OIDC"`).
  - Do not restrict `GET /api/auth/oidc/login` or `GET /api/auth/oidc/callback` (both cookie and bearer modes continue to work through OIDC).
- **Rationale**: Checking `ForceActive()` in `handleAuthLogin` blocks all non-OIDC login flows (web form, API cookie login, and API Bearer token login) in a single authoritative place.

### 4. Auto-redirect on the frontend login screen (`AuthPage.tsx`)
- **Decision**:
  - Extend `GET /api/auth/status` and `AuthStatus` in `web/src/api.ts` with `oidc_force: boolean` (value `cfg.ForceActive()`).
  - Pass `oidcForce={authStatus.oidc_force}` from `App.tsx` to `AuthPage.tsx`.
  - In `AuthPage.tsx`, when `initialized && oidcEnabled && oidcForce`:
    - Do not render the email/password `<form>`.
    - Trigger navigation to `/api/auth/oidc/login` inside a `useEffect` via an injectable/default redirect helper (e.g., `onOidcRedirect?: (url: string) => void` defaulting to `(url) => window.location.assign(url)` so Vitest can assert the redirect cleanly without fighting JSDOM `window.location` mocking).
    - Render a minimal "Redirecting to your identity provider..." card with a fallback `<a href="/api/auth/oidc/login">Sign in with OIDC</a>` button.
- **Rationale**: Prevents any flash of the password form and cleanly supports unit testing in Vitest/JSDOM.

### 5. Role editor UI in `SettingsPage.tsx`
- **Decision**:
  - In the Household Users list, for `u.id === user.id`, keep the static role badge (e.g., `admin (you)` or `admin`) so the signed-in admin cannot change their own role.
  - For `u.id !== user.id`, render a `<select>` (`aria-label={`Role for ${u.email}`}`) bound to `u.role` with `member` and `admin` options. On change, call `PATCH /api/users/${u.id}` with `{ role: nextRole }`, invalidate `["users"]`, and flash `"Updated role for <email>."` (or set `error` on failure).
  - In Instance Configuration → OIDC, add a checkbox for `oidcForce` ("Force OIDC login (disable local password sign-in)"), and disable both the `oidcAutoProv` ("Auto-provision new household members on OIDC login") and `oidcForce` checkboxes when `!oidcIssuer.trim() || !oidcClientId.trim()` (treating both as unchecked and sending `"false"` on save if issuer or client ID is empty). Include `oidc_force` in `PATCH /api/settings` and invalidate `["auth-status"]` alongside `["settings"]` after saving.
- **Rationale**: Compact, consistent with the existing Settings UI styling, accessible, and easy to test.

## Risks / Trade-offs

- **IdP outage lockout** → When `oidc_force` is enabled and the IdP is unreachable, users cannot sign in via local password. *Mitigation*: Clearly label the checkbox in Settings ("disable local password sign-in"), require OIDC issuer + client ID before enabling, and allow recovery by updating the `settings` table (`UPDATE settings SET value = 'false' WHERE key = 'oidc_force'`) or restarting without `OIDC_FORCE=true`.
- **Logout re-authentication with active IdP session** → Logging out of Itemized redirects back to `/api/auth/oidc/login`, which may silently re-authenticate if the IdP session is still active. *Mitigation*: This is standard behavior for forced OIDC/SSO deployments without RP-Initiated Logout and matches the requirement to redirect when landing on the login page.

# Proposal

## Why

Clicking the Logout button in the web application revokes the user's session on the backend, but leaves the authenticated UI rendered on screen until the user manually refreshes the page. In `web/src/App.tsx`, `handleLogout` calls `qc.clear()` before `qc.invalidateQueries({ queryKey: ["auth-status"] })`; because `clear()` removes the `["auth-status"]` query from the TanStack Query v5 cache, the subsequent `invalidateQueries` finds no matching query to refetch and the active `useQuery` observer stays stuck on the stale authenticated user. Users—whether signed in via local password or OIDC—should immediately return to the login screen upon logging out.

## What Changes

- Fix `handleLogout` in `web/src/App.tsx` so logging out clears all non-auth cached queries, resets the browser route to `/`, and transitions `["auth-status"]` to unauthenticated (updating cached `user` to `null` and refetching `/api/auth/status`) so `AppRoutes` immediately renders `AuthPage` without requiring a manual reload.
- Ensure the login screen transition works consistently across all auth configurations: local login, OIDC enabled (optional), and Force OIDC (where `AuthPage` immediately initiates `/api/auth/oidc/login`).
- Add frontend unit/integration tests covering logout behavior in `web/src/App.test.tsx`.

## Capabilities

### New Capabilities
<!-- None -->

### Modified Capabilities
- `web-ui`: Update `Authentication and settings views` to require that clicking Logout immediately clears cached authenticated data, resets the URL to `/`, and transitions the application to the login view (or Force OIDC redirect) without requiring a manual page reload.

## Impact

- Frontend: `web/src/App.tsx` (`AppRoutes` and `handleLogout`) and new tests in `web/src/App.test.tsx`.
- No backend API or database schema changes required (`POST /api/auth/logout` already revokes the session and clears the session cookie, and `GET /api/auth/status` already returns `user: null` afterward).

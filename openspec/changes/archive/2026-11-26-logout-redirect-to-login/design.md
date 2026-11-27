# Design

## Context

See `proposal.md` for motivation. In `web/src/App.tsx`, `AppRoutes` gates authenticated routes behind `useQuery({ queryKey: ["auth-status"], queryFn: () => apiFetch<AuthStatus>("/api/auth/status") })`. When `!authStatus.user`, `AppRoutes` renders `<AuthPage />` (which displays the login form/OIDC button, or immediately calls `window.location.assign("/api/auth/oidc/login")` when `oidc_force` is active).

Currently, `handleLogout` executes:
```ts
await apiFetch("/api/auth/logout", { method: "POST" });
qc.clear();
void qc.invalidateQueries({ queryKey: ["auth-status"] });
```
In `@tanstack/react-query` v5, `qc.clear()` removes every `Query` instance from `QueryCache` (including `["auth-status"]`). Calling `invalidateQueries({ queryKey: ["auth-status"] })` immediately afterward finds zero matching queries in the cache, so the active `useQuery` observer never refetches and remains on its stale `authStatus` with the previous `user` until a full page reload occurs.

## Goals / Non-Goals

**Goals:**
- Immediately transition `AppRoutes` from authenticated views to `<AuthPage />` on logout without requiring a manual browser refresh, for both local and OIDC sessions.
- Clear all cached non-auth queries and cancel in-flight queries so no prior user's data remains in memory or repopulates the cache after logout.
- Reset the browser route to `/` on logout so the URL does not remain stuck on a deep route (e.g., `/settings` or `/products/:id`).
- Keep `AppRoutes` testable by exporting it (or allowing `QueryClient` / `AuthPage` OIDC redirect injection in `App.test.tsx`).

**Non-Goals:**
- OIDC RP-initiated logout (`end_session_endpoint` redirect to the external IdP). Logout continues to revoke itemized's local session and return the user to itemized's login flow.
- Backend API changes (`POST /api/auth/logout` and `GET /api/auth/status` already behave as required).

## Decisions

### Decision 1: Evict non-auth queries and update `["auth-status"]` in place instead of `qc.clear()`
In `handleLogout`:
1. Call `await apiFetch("/api/auth/logout", { method: "POST" })`.
2. Call `await qc.cancelQueries()` to abort any in-flight authenticated requests.
3. Call `qc.removeQueries({ predicate: (query) => query.queryKey[0] !== "auth-status" })` to clear all cached inventory, settings, and user data while keeping the `["auth-status"]` query entry alive.
4. Call `qc.setQueryData<AuthStatus>(["auth-status"], (prev) => (prev ? { ...prev, user: null } : prev))` so `AppRoutes` synchronously transitions to `<AuthPage />` without flashing the full-screen loading state.
5. Call `navigate("/", { replace: true })` via React Router's `useNavigate()` to reset the URL to `/`.
6. Call `void qc.invalidateQueries({ queryKey: ["auth-status"] })` to re-verify auth status against `GET /api/auth/status` in the background.

**Alternatives considered:**
- *Full page reload (`window.location.assign("/")`)*: Works, but discards SPA transition smoothness, is harder to unit-test cleanly in jsdom, and isn't needed when TanStack Query state is managed properly.
- *`qc.resetQueries({ queryKey: ["auth-status"] })` after `removeQueries`*: Works, but sets `authStatus` to `undefined` while refetching, causing a brief `"Loading itemized..."` flash before `<AuthPage />` renders. Updating `user: null` via `setQueryData` plus background `invalidateQueries` gives an instant transition while still reconciling with the server.

### Decision 2: Keep `AppRoutes` cleanly testable with Vitest + Testing Library
Export `AppRoutes` (with an optional `onOidcRedirect` prop passed through to `AuthPage`) so `web/src/App.test.tsx` can render `AppRoutes` inside `QueryClientProvider`, `MemoryRouter`, and `HelpProvider` to test:
- Clicking Logout from a nested route (e.g., `/settings`) calls `POST /api/auth/logout`, clears non-auth queries, navigates to `/`, and renders `<AuthPage />` with the login form and OIDC button.
- Clicking Logout when `oidc_enabled: true` and `oidc_force: true` transitions to `<AuthPage />` and triggers the `/api/auth/oidc/login` redirect.

## Risks / Trade-offs

- **In-flight query completing during logout** → Mitigated by awaiting `qc.cancelQueries()` before `qc.removeQueries(...)`.
- **Transient logout request failure** → Wrapping `apiFetch("/api/auth/logout", ...)` so state cleanup still runs in `finally` (followed by `invalidateQueries({ queryKey: ["auth-status"] })`) ensures the UI stays consistent with server auth state rather than getting stuck.

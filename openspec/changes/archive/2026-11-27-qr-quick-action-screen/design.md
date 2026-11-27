# Design

## Context

See `proposal.md` for motivation. Currently, `internal/api/server.go` registers three server-side redirect handlers (`GET /go/i/{id}`, `GET /go/p/{id}`, `GET /go/l/{id}`) that check cookie auth, query SQLite directly, and issue `302 Found` redirects to `/products/:id` or `/locations/:id` (or `/login?next=...` when unauthenticated). Meanwhile, the React SPA already owns all interactive inventory views, `POST /api/scan/resolve` already resolves `/go/{i,p,l}/{id-or-uuid}` (including legacy UUIDs and merged product aliases), and `AppRoutes` renders `AuthPage` inline at whatever URL the browser is on when `!authStatus.user`.

## Goals / Non-Goals

**Goals:**
- Make scanning any printed QR code (`/go/i/:id`, `/go/p/:id`, `/go/l/:id`) with a phone's native camera land directly on a fast, mobile-first **QR Quick Action** screen with zero extra navigation.
- Reuse existing REST API endpoints (`POST /api/scan/resolve`, `POST /api/items/:id/consume`, `POST /api/items/:id/open`, `POST /api/items/:id/transfer`, `PATCH /api/items/:id`, `POST /api/items`, `POST /api/products/:id/toggle-shopping-list`, `GET /api/locations`) without adding redundant backend CRUD endpoints or database schema changes.
- Preserve the scanned `/go/:kind/:id` URL across both local password login and OIDC login (including `oidc_force` auto-redirect).
- Keep full backward compatibility with printed integer QR codes, legacy UUID QR codes, merged product aliases, and Demo Mode.

**Non-Goals:**
- Changing the printed QR code URL format (`/go/i/:id`, `/go/p/:id`, `/go/l/:id`) or ZPL label templates.
- Replacing the full `/products/:id` or `/locations/:id` management pages (both remain accessible directly and via "View Full Product / Location" links from the Quick Action screen).
- Allowing unauthenticated mutations without signing in (household authentication remains required except in Demo Mode).

## Decisions

### 1. Serve `/go/*` via the SPA handler instead of server-side 302 redirects
- **Decision**: Remove the `GET /go/i/{id}`, `GET /go/p/{id}`, and `GET /go/l/{id}` 302 redirect handlers in `internal/api/server.go` (and the now-unused `requireBrowserAuth` helper) so requests to `/go/...` fall through to `s.spaHandler()` and receive `index.html`.
- **Rationale**: Keeping the browser URL at `/go/:kind/:id` lets React Router mount `QrActionPage` directly, works identically for authenticated users, demo mode, and unauthenticated users (who see `AuthPage` in-place at `/go/:kind/:id` and immediately transition to `QrActionPage` upon login without losing the URL), and avoids duplicating resolution/merge logic in both Go redirect handlers and `handleScanResolve`.
- **Alternative considered**: Keeping `/go/...` as a 302 redirect to a new route like `/quick/item/:id`. Rejected because it adds an extra round-trip on mobile cellular/Wi-Fi, requires keeping server-side `requireBrowserAuth` + `/login?next=` redirect plumbing in sync, and the user explicitly requested landing on a screen using the `/go/:action/:id` link.

### 2. Resolve QR targets in `QrActionPage` using `POST /api/scan/resolve`
- **Decision**: `QrActionPage` reads `:kind` (`i`, `p`, `l`) and `:id` from `useParams()`, validates `:kind` is one of `i | p | l`, and calls `POST /api/scan/resolve` with `{ input: `/go/${kind}/${id}` }`.
- **Rationale**: `handleScanResolve` already implements integer ID lookup, `legacy_uuid` lookup, and `product_merge_aliases` resolution, and returns rich payloads (`item` + `product`, `product` + unconsumed `items`, or `location` + unconsumed `items`). No new backend resolve endpoint is needed.
- **Note on Product restock (+1)**: `POST /api/items` already accepts `{ product_id, location_id, quantity: 1, due_on_date }` and automatically clears `manually_added_to_shopping_list`. The frontend computes `due_on_date` from `product.calculated_due_days ?? product.default_due_days` (same helper logic used in `ScannerDrawer` / `ProductDetailPage`), falling back to `null` if neither is configured.

### 3. Preserve `next` path through OIDC login with strict open-redirect validation
- **Decision**: Add `Next string` to `auth.pendingOIDCState` and `auth.OIDCResult`. In `handleOIDCLogin`, read `r.URL.Query().Get("next")` and pass it through a `sanitizeNextPath(next string) string` helper that accepts only relative paths beginning with a single `/` (rejecting empty strings, `//...`, backslashes, control characters, or URLs with scheme/host) and defaults to `"/"`. In `handleOIDCCallback` (cookie mode), redirect to `res.Next` (falling back to `"/"`). On the frontend, `AuthPage` appends `?next=<encodeURIComponent(location.pathname + location.search)>` to `/api/auth/oidc/login` when the current path is not `/` or `/login`.
- **Rationale**: Local login already stays on `/go/:kind/:id` because `AuthPage` renders inline without changing `window.location`. Without `next` on OIDC, households using OIDC (especially `oidc_force`) would be bounced to `/` after scanning a QR code while logged out.
- **Alternative considered**: Storing `next` in `sessionStorage` on the frontend. Rejected because iOS Safari / in-app camera webviews can drop or isolate storage across cross-site OIDC redirects, whereas server-side `pendingOIDCState` bound to the PKCE `state` parameter is reliable and tamper-proof.

### 4. Mobile-first UI structure for `QrActionPage`
- **Decision**: Render `QrActionPage` inside `Layout` (so the user retains the navigation dock/sidebar and Demo Mode banner) with a focused, single-column `max-w-xl mx-auto` card layout:
  - Large touch targets (`min-h-[44px]`) for primary actions (**Consume**, **Open**, **Transfer**).
  - Inline **Transfer** drawer/panel inside the card or item row using the existing `HierarchySelect` component (loaded from `GET /api/locations`) so moving an item takes 2 taps without leaving the screen.
  - Persistent **Undo** banner at the top of the screen after any Consume or Open action (storing `{ itemId, label, patchPayload }` and calling `PATCH /api/items/:id`), matching the safety net in `ScannerDrawer`.
  - On Location QR (`/go/l/:id`), derive direct child locations from `GET /api/locations` (`loc.parent_id === location.id`) and show them as clickable `/go/l/:childId` chips; show a quick filter input when `items.length > 5`.
- **Rationale**: Wrapping in `Layout` keeps the experience cohesive with the rest of `itemized` while the centered `max-w-xl` card keeps all primary actions immediately reachable with one thumb on a phone.

## Risks / Trade-offs

- **[Breaking existing 302 expectations in tests or external bookmarks]** → Update `internal/api/api_test.go` and `internal/api/demo_test.go` to verify `/go/...` serves the SPA (when `StaticFS` is configured) and that `POST /api/scan/resolve` continues to resolve integer IDs, legacy UUIDs, and merged products. Any external bookmark to `/go/...` still works and now opens the Quick Action screen instead of redirecting.
- **[`s.StaticFS == nil` in Go unit tests]** → In unit tests where `NewServer(db, nil)` has `StaticFS == nil`, `/go/...` will return 404 unless tested with a mock `fstest.MapFS` containing `index.html`. Tests in `api_test.go` / `demo_test.go` can pass a minimal `fstest.MapFS{"index.html": ...}` when verifying `/go/...` SPA delivery.
- **[Large location lists on `/go/l/:id`]** → Adding a client-side filter input when a location has > 5 items keeps finding a specific item fast even in a large pantry or deep freezer.

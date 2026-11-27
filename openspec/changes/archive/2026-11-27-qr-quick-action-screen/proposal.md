# Proposal

## Why

Scanning a printed Itemized QR code (`/go/i/:id`, `/go/p/:id`, `/go/l/:id`) with a phone's native camera currently triggers a server-side 302 redirect straight to the full product or location detail page. For household members (especially spouses who just want to grab something from the pantry or freezer and mark it used), landing on a dense management page—or a location page that has no Consume action at all—adds unnecessary friction and discourages keeping inventory up to date.

## What Changes

- **BREAKING**: Serve the SPA directly on `GET /go/i/:id`, `GET /go/p/:id`, and `GET /go/l/:id` instead of issuing HTTP 302 redirects to `/products/:id` and `/locations/:id`, so scanning any printed QR code (integer ID, legacy UUID, or merged product alias) lands on a dedicated, mobile-first **QR Quick Action** screen while preserving the URL.
- Add a dedicated `/go/:kind/:id` React route (`QrActionPage`) optimized for one-handed phone use with large, clear action buttons:
  - **Item QR (`/go/i/:id`)**: Displays the item's product name, variant, current location, due date/status, opened status, and notes; provides one-tap **Consume** (with **Undo**), **Open** (if unopened, applying `default_due_days_on_open` with **Undo**), **Transfer** (location picker applying freeze/thaw due-date rules), **Shopping List** toggle, and a **View Full Product** link. If the item was already consumed, shows when it was consumed with a **Restore / Unconsume** option and a quick link to the product.
  - **Product QR (`/go/p/:id`)**: Resolves merged product aliases, displays product summary and current stock count, lists all in-stock items ordered by soonest due date (FIFO) with one-tap **Consume** (highlighting a prominent quick-consume action for the soonest-due unit), **Open**, and **Transfer** (with **Undo**), plus **Quick Add (+1)** restock, **Shopping List** toggle, and a **View Full Product** link.
  - **Location QR (`/go/l/:id`)**: Displays the location hierarchy name, freezer badge, and item count; lists every in-stock item in that location (with quick search/filter when the list is large) with one-tap **Consume** (with **Undo**), **Open**, and **Transfer** directly from the list; displays clickable **Sub-locations** chips if the location has child locations; and provides a **View Full Location** link.
  - **Not Found / Invalid QR**: Renders a clear, friendly error state with a button back to Inventory instead of redirecting to `/?alert=...`.
- Preserve the scanned `/go/:kind/:id` destination across authentication: local email/password login already keeps the browser URL, and OIDC login (`GET /api/auth/oidc/login` + callback) will accept and validate a safe relative `next` redirect path so signed-out users land straight on their scanned QR screen after signing in.

## Capabilities

### New Capabilities
- `qr-quick-action`: Dedicated mobile-first QR quick-action landing screen at `/go/:kind/:id` for item, product, and location QR codes with one-tap consume, open, transfer, undo, restock, shopping list, and sub-location navigation.

### Modified Capabilities
- `barcode-scanning`: Replace the HTTP 302 redirect behavior of `GET /go/i/:id`, `GET /go/p/:id`, and `GET /go/l/:id` with direct SPA delivery of the QR quick-action landing screen while maintaining support for integer IDs, `legacy_uuid`, merged product aliases, and demo mode.
- `user-auth`: Support a validated relative `next` redirect path through the OIDC login and callback flow so unauthenticated users who scan a `/go/...` QR code return to it immediately after signing in.

## Impact

- **Backend (`internal/api/`, `internal/auth/`)**:
  - `internal/api/server.go`: Remove or replace the 302 redirect handlers for `GET /go/i/{id}`, `GET /go/p/{id}`, `GET /go/l/{id}` so `/go/*` falls through to `spaHandler()` (or serves `index.html`); pass `next` through `handleOIDCLogin` / `handleOIDCCallback` with open-redirect validation.
  - `internal/auth/oidc.go`: Store validated `Next` path in `pendingOIDCState` and return it on `OIDCResult`.
  - `internal/api/workflows.go`: Reuse existing `POST /api/scan/resolve` (and existing item/product/location endpoints) for resolving `/go/{i,p,l}/{id-or-uuid}` including legacy UUIDs and merged products.
  - `internal/api/api_test.go`, `internal/api/demo_test.go`: Update existing `/go/...` tests from 302 redirect assertions to SPA / API resolution assertions and add OIDC `next` redirect tests.
- **Frontend (`web/src/`)**:
  - `web/src/App.tsx`: Add `/go/:kind/:id` route pointing to `QrActionPage`.
  - `web/src/pages/QrActionPage.tsx` (+ tests): New mobile-first quick-action page for item, product, and location QR codes.
  - `web/src/pages/AuthPage.tsx`: Pass current pathname+search as `?next=...` on OIDC login links/redirects so OIDC users return to `/go/...`.
- **Docs**: Update `docs/use/barcode-scanning.md` (and regenerated help index if applicable) if needed to mention scanning printed QR codes with the phone camera opens the Quick Action screen.

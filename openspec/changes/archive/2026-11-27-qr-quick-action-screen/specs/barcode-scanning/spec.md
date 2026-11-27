# Spec Delta

## MODIFIED Requirements

### Requirement: Legacy QR code redirect routes
The system SHALL serve the web application SPA directly on `GET /go/i/:id`, `GET /go/p/:id`, and `GET /go/l/:id` (instead of issuing server-side HTTP 302 redirects to `/products/:id` or `/locations/:id`) so scanning any printed QR code lands directly on the QR Quick Action screen at that URL. Both newly printed integer IDs and previously printed `legacy_uuid` tokens—as well as merged product aliases on `/go/p/:id`—SHALL resolve cleanly through the QR Quick Action screen once authenticated (or automatically in demo mode).

#### Scenario: Scanning an existing legacy UUID item QR with phone camera
- **WHEN** an authenticated user navigates to `/go/i/<legacy-uuid>`
- **THEN** the server serves the web application SPA at `/go/i/<legacy-uuid>` and the QR Quick Action screen resolves the item by `legacy_uuid` (displaying an already-consumed state with restore option if already consumed)

#### Scenario: Scanning a newly printed integer item QR with phone camera
- **WHEN** an authenticated user navigates to `/go/i/<int-id>`
- **THEN** the server serves the web application SPA at `/go/i/<int-id>` and the QR Quick Action screen resolves the item by integer `id`

#### Scenario: Scanning an unknown identifier
- **WHEN** an authenticated user navigates to `/go/i/<unknown-id>`
- **THEN** the server serves the web application SPA at `/go/i/<unknown-id>` and the QR Quick Action screen displays an item-not-found state with a link back to Inventory

#### Scenario: Scanning a merged product integer QR with phone camera
- **WHEN** Product A (ID `12`) was merged into Product B (ID `4`) and an authenticated user navigates to `/go/p/12`
- **THEN** the server serves the web application SPA at `/go/p/12` and the QR Quick Action screen resolves the merge alias to Product B

#### Scenario: Scanning a merged product legacy UUID QR with phone camera
- **WHEN** Product A (with `legacy_uuid`) was merged into Product B (ID `4`) and an authenticated user navigates to `/go/p/<product-a-legacy-uuid>`
- **THEN** the server serves the web application SPA at `/go/p/<product-a-legacy-uuid>` and the QR Quick Action screen resolves the merge alias to Product B

#### Scenario: Unauthenticated user scans a QR code
- **WHEN** an unauthenticated user navigates to `/go/i/42`
- **THEN** the web application renders the sign-in screen while preserving `/go/i/42` as the post-login destination so the user lands directly on `/go/i/42` after signing in

# Spec Delta

## MODIFIED Requirements

### Requirement: Legacy QR code redirect routes
The system SHALL serve `GET /go/i/:id`, `GET /go/p/:id`, and `GET /go/l/:id` accepting either an integer ID or a `legacy_uuid`, redirecting authenticated users to the corresponding item's product view, product view, or location view so both newly printed compact labels and previously printed UUID labels work seamlessly. When `GET /go/p/:id` receives an integer ID or `legacy_uuid` belonging to a product that was merged into another product, the system SHALL follow the merge alias and redirect to the destination product view.

#### Scenario: Scanning an existing legacy UUID item QR with phone camera
- **WHEN** an authenticated user navigates to `/go/i/<legacy-uuid>`
- **THEN** the system resolves the item by `legacy_uuid` and redirects to its product view (with a notice if the item was already consumed)

#### Scenario: Scanning a newly printed integer item QR with phone camera
- **WHEN** an authenticated user navigates to `/go/i/<int-id>`
- **THEN** the system resolves the item by integer `id` and redirects to its product view

#### Scenario: Scanning an unknown identifier
- **WHEN** a user navigates to `/go/i/<unknown-id>`
- **THEN** the system redirects to the home view with an item-not-found alert

#### Scenario: Scanning a merged product integer QR with phone camera
- **WHEN** Product A (ID `12`) was merged into Product B (ID `4`) and an authenticated user navigates to `/go/p/12`
- **THEN** the system resolves the merge alias and redirects to `/products/4`

#### Scenario: Scanning a merged product legacy UUID QR with phone camera
- **WHEN** Product A (with `legacy_uuid`) was merged into Product B (ID `4`) and an authenticated user navigates to `/go/p/<product-a-legacy-uuid>`
- **THEN** the system resolves the merge alias and redirects to `/products/4`

### Requirement: Unified scan resolution endpoint
The system SHALL provide `POST /api/scan/resolve` accepting raw scanned input (QR URL on any hostname containing `/go/{i,l,p}/<id-or-uuid>`, bare UUID, or retail barcode string) and returning the resolved entity kind (`item`, `product`, `location`, `barcode`, or `unknown`) with associated unconsumed items. When a scanned product QR URL (`/go/p/<id-or-uuid>`) or bare legacy UUID refers to a product that was merged into another product, `POST /api/scan/resolve` SHALL follow the merge alias and return `{ "kind": "product", "product": <destination-product>, "items": <destination-unconsumed-items> }` so all scanner workflows act against the destination product.

#### Scenario: Resolving a legacy QR URL from an old hostname
- **WHEN** a client sends `{ "input": "https://my.itemizedapp.com/go/i/<legacy-uuid>" }` to `POST /api/scan/resolve`
- **THEN** the system extracts `<legacy-uuid>` regardless of hostname, looks up the item by `legacy_uuid`, and returns `{ "kind": "item", ... }` with the item and product metadata

#### Scenario: Resolving a newly printed integer QR URL
- **WHEN** a client sends `{ "input": "https://itemized.local/go/i/42" }` to `POST /api/scan/resolve`
- **THEN** the system extracts `42`, looks up the item by integer `id`, and returns `{ "kind": "item", ... }` with the item and product metadata

#### Scenario: Resolving an unrecognized retail barcode
- **WHEN** a client sends a retail UPC not present in `barcodes`
- **THEN** the system returns `{ "kind": "unknown", "barcode": "<upc>" }`

#### Scenario: Resolving a merged product QR URL by integer ID
- **WHEN** Product A (ID `12`) was merged into Product B (ID `4`) and a client sends `{ "input": "https://itemized.local/go/p/12" }` to `POST /api/scan/resolve`
- **THEN** the system resolves the merge alias and returns `{ "kind": "product", "product": <Product B>, "items": <Product B unconsumed items> }`

#### Scenario: Resolving a merged product legacy UUID via QR URL or bare UUID
- **WHEN** Product A (with `legacy_uuid`) was merged into Product B (ID `4`) and a client sends `{ "input": "https://my.itemizedapp.com/go/p/<product-a-legacy-uuid>" }` or `{ "input": "<product-a-legacy-uuid>" }` to `POST /api/scan/resolve`
- **THEN** the system resolves the merge alias and returns `{ "kind": "product", "product": <Product B>, "items": <Product B unconsumed items> }`

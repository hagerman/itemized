# Spec Delta

## Purpose

Provides unified QR and retail barcode resolution, legacy QR redirect compatibility, a shared multi-mode camera and HID scanner interface, and streamlined Purchase, Consume/Open, Transfer, and Inventory Audit workflows.

## ADDED Requirements

### Requirement: Legacy QR code redirect routes
The system SHALL serve `GET /go/i/:id`, `GET /go/p/:id`, and `GET /go/l/:id` accepting either an integer ID or a `legacy_uuid`, redirecting authenticated users to the corresponding item's product view, product view, or location view so both newly printed compact labels and previously printed UUID labels work seamlessly.

#### Scenario: Scanning an existing legacy UUID item QR with phone camera
- **WHEN** an authenticated user navigates to `/go/i/<legacy-uuid>`
- **THEN** the system resolves the item by `legacy_uuid` and redirects to its product view (with a notice if the item was already consumed)

#### Scenario: Scanning a newly printed integer item QR with phone camera
- **WHEN** an authenticated user navigates to `/go/i/<int-id>`
- **THEN** the system resolves the item by integer `id` and redirects to its product view

#### Scenario: Scanning an unknown identifier
- **WHEN** a user navigates to `/go/i/<unknown-id>`
- **THEN** the system redirects to the home view with an item-not-found alert

### Requirement: Unified scan resolution endpoint
The system SHALL provide `POST /api/scan/resolve` accepting raw scanned input (QR URL on any hostname containing `/go/{i,l,p}/<id-or-uuid>`, bare UUID, or retail barcode string) and returning the resolved entity kind (`item`, `product`, `location`, `barcode`, or `unknown`) with associated unconsumed items.

#### Scenario: Resolving a legacy QR URL from an old hostname
- **WHEN** a client sends `{ "input": "https://my.itemizedapp.com/go/i/<legacy-uuid>" }` to `POST /api/scan/resolve`
- **THEN** the system extracts `<legacy-uuid>` regardless of hostname, looks up the item by `legacy_uuid`, and returns `{ "kind": "item", ... }` with the item and product metadata

#### Scenario: Resolving a newly printed integer QR URL
- **WHEN** a client sends `{ "input": "https://itemized.local/go/i/42" }` to `POST /api/scan/resolve`
- **THEN** the system extracts `42`, looks up the item by integer `id`, and returns `{ "kind": "item", ... }` with the item and product metadata

#### Scenario: Resolving an unrecognized retail barcode
- **WHEN** a client sends a retail UPC not present in `barcodes`
- **THEN** the system returns `{ "kind": "unknown", "barcode": "<upc>" }`

### Requirement: Shared live scanner with mode switching
The web application SHALL provide a unified Scanner view with a mode switcher (`Purchase`, `Consume`, `Open`, `Transfer`, `Inventory`) that shares a single live camera stream, torch toggle, lens selector, audio feedback, and keyboard/USB-scanner text input across mode switches.

#### Scenario: Switching scan modes preserves camera session
- **WHEN** a user switches from `Purchase` to `Consume` in the Scanner view
- **THEN** the active camera stream and torch preference remain active without restarting the camera

### Requirement: Streamlined Purchase workflow
The Purchase workflow SHALL resolve scanned barcodes or product searches, invoke UPC lookup and optional LLM classification for unknown barcodes, allow selecting an existing product or creating a new product, support attaching one or two retail barcodes with variant/pack details in an expandable section, create items with calculated due dates, and trigger label printing according to `label_print_mode`.

#### Scenario: Purchasing a known barcode
- **WHEN** a user scans a known retail barcode in Purchase mode
- **THEN** the UI proceeds directly to the Confirm & Add step pre-populated with the matched product, variant, default quantity, default location, and calculated due date

#### Scenario: Purchasing an unknown barcode
- **WHEN** a user scans an unknown retail barcode in Purchase mode
- **THEN** the system looks up the barcode via UPC lookup (and optional LLM classification), lets the user select or create a product, associates the barcode, creates the items, and triggers configured label printing

### Requirement: Consume and Open workflows with continuous scan and undo
In `Consume` or `Open` mode, scanning a specific `Item` QR (`/go/i/:id`) SHALL immediately consume or open the item, keep the scanner active for continuous scanning with duplicate-scan debounce, and display a temporary toast with a one-tap Undo action. Scanning a `Product`, `Barcode`, or `Location` SHALL list unconsumed items ordered by soonest `due_on_date` for selection.

#### Scenario: Continuous item scan with undo
- **WHEN** a user scans `/go/i/<uuid>` in Consume mode and taps Undo on the confirmation toast
- **THEN** the item's `consumed_on_date` is cleared and the item returns to available stock

#### Scenario: Unknown barcode in Consume mode
- **WHEN** a user scans an unrecognized retail barcode in Consume mode
- **THEN** the UI offers inline association of that barcode to an existing product without leaving the workflow

### Requirement: Transfer workflow
In `Transfer` mode, the user SHALL first select or scan a destination `Location` (`/go/l/:id`), then scan `Item` QRs (transferred immediately with an Undo toast) or `Product`/`Barcode` entries (selecting items to move), while keeping the destination location locked for rapid batch transfers.

#### Scenario: Batch transfer into a freezer location
- **WHEN** a user locks a destination location with `is_freezer=true` and scans two item QRs
- **THEN** both items move to that location, apply `default_due_days_on_freeze` if configured, and the destination stays selected for the next scan

### Requirement: Inventory Audit workflow
In `Inventory` mode, the user SHALL select or scan a `Location`, scan all physically present items/products (prompting for quantity on product/barcode scans), review a reconciliation summary categorizing items to Consume (missing), Transfer (found from another location), Confirm (already here), and Create (out of stock/extra with due-date picker), toggle checkboxes for any action, and apply all selected actions in one batch.

#### Scenario: Reconciling a location audit
- **WHEN** a user finishes scanning a location and submits the reconciliation summary
- **THEN** the system atomically applies all selected consume, transfer, and create actions and reports the summary counts

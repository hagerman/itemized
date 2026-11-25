# Spec Delta

## MODIFIED Requirements

### Requirement: Unified scan resolution endpoint
The system SHALL provide `POST /api/scan/resolve` accepting raw scanned input (QR URL on any hostname containing `/go/{i,l,p}/<id-or-uuid>`, bare UUID, or retail barcode string) and returning the resolved entity kind (`item`, `product`, `location`, `barcode`, or `unknown`) with associated unconsumed items. When a scanned product QR URL (`/go/p/<id-or-uuid>`) or bare legacy UUID refers to a product that was merged into another product, `POST /api/scan/resolve` SHALL follow the merge alias and return `{ "kind": "product", "product": <destination-product>, "items": <destination-unconsumed-items> }` so all scanner workflows act against the destination product. When resolving a retail barcode against `barcodes`, the system SHALL first attempt an exact match on the trimmed input; if no exact match exists and the input is a numeric retail barcode (6–14 digits), the system SHALL fall back to matching equivalent leading-zero UPC/EAN/GTIN forms (such as 12-digit UPC-A ↔ 13-digit EAN-13 with a leading `0` ↔ 14-digit GTIN-14 with leading `0`/`00`, and 11-digit UPC-A without a leading `0` ↔ 12-digit UPC-A) and return `{ "kind": "barcode", ... }` with the matched variant and product.

#### Scenario: Resolving a legacy QR URL from an old hostname
- **WHEN** a client sends `{ "input": "https://my.itemizedapp.com/go/i/<legacy-uuid>" }` to `POST /api/scan/resolve`
- **THEN** the system extracts `<legacy-uuid>` regardless of hostname, looks up the item by `legacy_uuid`, and returns `{ "kind": "item", ... }` with the item and product metadata

#### Scenario: Resolving a newly printed integer QR URL
- **WHEN** a client sends `{ "input": "https://itemized.local/go/i/42" }` to `POST /api/scan/resolve`
- **THEN** the system extracts `42`, looks up the item by integer `id`, and returns `{ "kind": "item", ... }` with the item and product metadata

#### Scenario: Resolving an unrecognized retail barcode
- **WHEN** a client sends a retail UPC not present in `barcodes` (under either exact or equivalent leading-zero retail barcode forms)
- **THEN** the system returns `{ "kind": "unknown", "barcode": "<upc>" }`

#### Scenario: Resolving a merged product QR URL by integer ID
- **WHEN** Product A (ID `12`) was merged into Product B (ID `4`) and a client sends `{ "input": "https://itemized.local/go/p/12" }` to `POST /api/scan/resolve`
- **THEN** the system resolves the merge alias and returns `{ "kind": "product", "product": <Product B>, "items": <Product B unconsumed items> }`

#### Scenario: Resolving a merged product legacy UUID via QR URL or bare UUID
- **WHEN** Product A (with `legacy_uuid`) was merged into Product B (ID `4`) and a client sends `{ "input": "https://my.itemizedapp.com/go/p/<product-a-legacy-uuid>" }` or `{ "input": "<product-a-legacy-uuid>" }` to `POST /api/scan/resolve`
- **THEN** the system resolves the merge alias and returns `{ "kind": "product", "product": <Product B>, "items": <Product B unconsumed items> }`

#### Scenario: Resolving a 13-digit EAN-13 scan against a stored 12-digit UPC-A barcode
- **WHEN** a variant has stored barcode `"048121277079"` and a client sends `{ "input": "0048121277079" }` to `POST /api/scan/resolve`
- **THEN** the system matches the existing variant barcode and returns `{ "kind": "barcode", ... }` with that variant and its mapped product

#### Scenario: Resolving a 12-digit UPC-A scan against a stored 13-digit leading-zero EAN-13 barcode
- **WHEN** a variant has stored barcode `"0810732022887"` and a client sends `{ "input": "810732022887" }` to `POST /api/scan/resolve`
- **THEN** the system matches the existing variant barcode and returns `{ "kind": "barcode", ... }` with that variant and its mapped product

#### Scenario: Exact barcode match takes precedence over leading-zero equivalents
- **WHEN** `barcodes` contains an exact match for the scanned input alongside another leading-zero-equivalent barcode
- **THEN** `POST /api/scan/resolve` returns the exact-matching barcode record

### Requirement: Shared live scanner with mode switching
The web application SHALL provide a Scanner modal (bottom-aligned on mobile, middle-aligned on desktop) with a mode switcher (`Purchase`, `Consume`, `Open`, `Transfer`, `Inventory`) sharing one live camera stream, torch toggle, lens selector, audio feedback, and keyboard/HID input. The camera SHALL auto-start on mobile devices and stay hidden by default on desktop. The modal SHALL stay compact when collapsed—with idle modes that have no mode-specific controls (`Purchase`, `Consume`, `Open`) rendering at the same compact height without extra empty spacing, while modes with default mode-specific controls (`Transfer`, `Inventory`) expand to fit those controls—and expand vertically into available viewport height to avoid unnecessary scrolling. When the camera API is unavailable in an insecure HTTP context, the scanner SHALL display an actionable message explaining that live camera scanning requires HTTPS (such as via a reverse proxy). When starting the live camera in a secure context without an explicit lens selection, the scanner SHALL request the rear-facing camera by default and populate the lens selector after camera permission is granted. Duplicate-scan debouncing SHALL treat equivalent leading-zero numeric retail barcode representations (such as 12-digit UPC-A and its 13-digit leading-zero EAN-13 form) as the same physical barcode within the debounce window. Closing the Scanner modal SHALL reset all transient workflow state (including partially entered form fields, search results, lookup banners and in-flight lookup requests, item selections, unknown-barcode association state, transfer destination, inventory audit progress, status/error messages, and undo toasts) so reopening starts clean, while persisting only the user's last selected scan mode in browser storage so subsequent opens on that browser (including after page reloads) default to the previously chosen mode (falling back to `Purchase` when no valid mode is stored).

#### Scenario: Switching scan modes preserves camera session
- **WHEN** a user switches from `Purchase` to `Consume` in the Scanner view
- **THEN** the active camera stream and torch preference remain active without restarting the camera

#### Scenario: Camera starts automatically on mobile devices
- **WHEN** a user opens `Scan / Action` on a mobile viewport or coarse-pointer touch device
- **THEN** the live camera viewfinder is enabled by default without requiring an extra tap on the Camera button, and the user can still toggle it off

#### Scenario: Camera stays hidden by default on desktop
- **WHEN** a user opens `Scan / Action` on a desktop viewport
- **THEN** the live camera viewfinder remains hidden by default until the user clicks the Camera button

#### Scenario: Modal expands into available vertical space without clipping dropdowns
- **WHEN** a user opens a location or category selector inside `Scan & Action` while vertical viewport space is available
- **THEN** the selector menu is displayed without clipping or forced internal scrolling inside a short modal, while keeping the modal middle-aligned on desktop and bottom-aligned on mobile (scrolling only if content exceeds viewport height)

#### Scenario: Idle modes without extra controls share the same compact height
- **WHEN** a user opens `Scan & Action` in `Purchase` mode (idle, with no lookup banners, search results, or form open) and switches between `Purchase`, `Consume`, and `Open`
- **THEN** no empty workflow container or extra bottom spacing is rendered below the scanner bar in `Purchase` mode, so `Purchase`, `Consume`, and `Open` share the same compact default height, while `Transfer` and `Inventory` remain taller only as needed for their default location selector controls

#### Scenario: Insecure HTTP context displays HTTPS guidance
- **WHEN** a user enables the camera in a non-secure context (e.g., `http://192.168.1.21:8080`) where `navigator.mediaDevices.getUserMedia` is unavailable
- **THEN** the scanner displays an error explaining that live camera scanning requires HTTPS (for example, placing Itemized behind an HTTPS reverse proxy) while keeping manual/HID barcode input usable

#### Scenario: Secure context without camera API displays browser-unavailable error
- **WHEN** a user enables the camera in a secure context whose browser lacks `navigator.mediaDevices.getUserMedia`
- **THEN** the scanner displays `"Camera API unavailable in this browser."`

#### Scenario: Rear camera is preferred by default and lens selector populates after permission
- **WHEN** a user starts the live camera in a secure context without having manually switched lenses
- **THEN** the scanner requests `{ facingMode: "environment" }` and refreshes the list of available video input devices after the camera stream starts so the lens switcher can cycle between cameras on iOS and other mobile browsers

#### Scenario: Equivalent UPC-A and EAN-13 decodes within debounce window emit only once
- **WHEN** the scanner decodes `"048121277079"` and then `"0048121277079"` within the 1500ms duplicate-scan debounce window
- **THEN** the second decode is ignored as a duplicate scan

#### Scenario: Closing and reopening resets all transient workflow state
- **WHEN** a user enters data or starts a workflow inside `Scan / Action` (such as scanning an unknown barcode and typing a new product name in `Purchase`, selecting candidate items in `Consume`, choosing a destination in `Transfer`, or scanning items in `Inventory`), closes the modal, and reopens it
- **THEN** all previously entered fields, search hits, candidate lists, destination/audit selections, status/error banners, and undo toasts are cleared and the modal opens in a fresh state

#### Scenario: In-flight barcode lookup from a closed modal is discarded
- **WHEN** a user scans an unknown barcode in `Purchase` mode, closes the modal before OpenFoodFacts or LLM classification finishes, and reopens the modal
- **THEN** the late response from the closed session does not populate form fields, banners, or search hits in the reopened modal

#### Scenario: Selected scan mode persists across modal reopens and browser reloads
- **WHEN** a user opens `Scan / Action`, switches from `Purchase` to `Consume`, closes the modal, and later reopens `Scan / Action` (either in the same session or after reloading the page on the same browser)
- **THEN** the modal opens with `Consume` selected as the active mode

#### Scenario: Default scan mode falls back to Purchase when storage is empty or invalid
- **WHEN** a user opens `Scan / Action` in a browser with no saved scan mode (or an unrecognized/unavailable stored value)
- **THEN** the modal opens in `Purchase` mode without errors

### Requirement: Streamlined Purchase workflow
The Purchase workflow SHALL resolve scanned barcodes or product searches, pre-fill `Due Date` from `calculated_due_days` or `default_due_days`, show loading indicators during UPC lookup and LLM classification for unknown barcodes, pre-fill the variant name from the UPC title and collapsible measurements from LLM classification, allow selecting or creating a product with one or two barcodes, create items with calculated due dates, and trigger label printing per `label_print_mode`. When a scanned barcode resolves to an existing variant (`kind: "barcode"`), the Purchase workflow SHALL immediately use that mapped product and variant in the Confirm & Add step without calling OpenFoodFacts lookup or LLM classification, and SHALL cancel any in-flight unknown-barcode lookup/classification and clear stale lookup banners, classifier warnings, and product search hits.

#### Scenario: Purchasing a known barcode
- **WHEN** a user scans a known retail barcode in Purchase mode for a product with `calculated_due_days = 34` (or `default_due_days = 34`)
- **THEN** the UI proceeds directly to the Confirm & Add step pre-populated with the matched product, variant, default quantity, default location, and `Due Date` set to `today + 34 days`, without calling `/api/upc/lookup` or `/api/upc/classify`

#### Scenario: Known barcode scan cancels in-flight lookup and clears stale classification UI
- **WHEN** an unknown barcode lookup or LLM classification is in flight (or its banner/search hits are visible) in Purchase mode and the user scans a barcode that resolves to an existing variant
- **THEN** the UI immediately clears lookup/classification loading indicators, banners, warnings, and search hits, displays Confirm & Add for the matched product and variant, and discards any late response from the earlier lookup or classification request

#### Scenario: Purchasing an unknown barcode
- **WHEN** a user scans an unknown retail barcode in Purchase mode
- **THEN** the system looks up the barcode via UPC lookup (and optional LLM classification), lets the user select or create a product, associates the barcode, creates the items, and triggers configured label printing

#### Scenario: Loading indicators during unknown barcode lookup and classification
- **WHEN** a user scans an unknown retail barcode in Purchase mode
- **THEN** the UI displays a loading indicator while querying OpenFoodFacts (`Looking up barcode in OpenFoodFacts...`), immediately displays the OpenFoodFacts title banner once returned, and displays a classification loading indicator (`Classifying product...`) while the optional LLM classifier runs in the background before clearing it on completion or failure

#### Scenario: Variant name pre-filled from OpenFoodFacts title
- **WHEN** OpenFoodFacts returns a product title (e.g., `"Pepsi Cola"`) for an unknown barcode in Purchase mode
- **THEN** the `Variant name` input in `Variant & Barcode Details` is automatically pre-populated with that title while remaining editable by the user

#### Scenario: LLM measurement pre-fill and persistence in Purchase workflow
- **WHEN** the LLM classifier returns a measurement (`product_value`, `product_unit_type`, `product_unit`) for an unknown barcode in Purchase mode
- **THEN** the collapsible optional measurement fields for both the new product and the variant are pre-populated with that measurement, can be expanded and adjusted or cleared by the user, and are persisted on the created product and variant when confirmed

#### Scenario: Selecting an existing product from Purchase search pre-fills Due Date
- **WHEN** a user searches for or selects an existing product in Purchase mode that has a rolling-average or fixed default due days
- **THEN** the `Due Date` input is immediately pre-populated with `today + effectiveDueDays` while remaining editable before confirming

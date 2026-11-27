# barcode-scanning Specification

## Purpose

Provides unified QR and retail barcode resolution, legacy QR redirect compatibility, a shared multi-mode camera and HID scanner interface, and streamlined Purchase, Consume/Open, Transfer, and Inventory Audit workflows.

## Requirements

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

### Requirement: Live barcode and QR decoding without native BarcodeDetector
The live camera scanner SHALL continuously decode both 1D retail barcodes (UPC-A, UPC-E, EAN-13, EAN-8, Code 128, Code 39, ITF) and 2D QR codes from the active video stream on browsers that do not implement the native `BarcodeDetector` API (including iOS Safari), using a self-hosted WebAssembly decoder bundled with the application (with no external CDN requests), without stalling on already-playing video elements or terminating on transient frame decode errors, and surfacing an error if the decoder fails to initialize.

#### Scenario: Decoding UPC or QR codes on iOS Safari without native BarcodeDetector
- **WHEN** the live camera stream starts and begins playing in a browser where `window.BarcodeDetector` is unavailable
- **THEN** the scanner captures frames from the active video stream once dimensions are available (`readyState >= 2`, `videoWidth > 0`, `videoHeight > 0`), decodes them using the self-hosted WebAssembly decoder, and emits decoded UPC barcodes and printed QR URLs to the active scan workflow

#### Scenario: Transient frame error does not halt continuous scanning
- **WHEN** a frame decode attempt fails with a transient error (such as no barcode in frame or an unready frame)
- **THEN** the scanner continues scheduling subsequent frame decode attempts until the camera is stopped or unmounted

#### Scenario: High-resolution rear camera constraints requested for sharp 1D/2D scanning
- **WHEN** the scanner starts the live camera
- **THEN** it requests ideal HD video dimensions (`1280x720`) alongside the selected camera constraint so fine 1D UPC bars and small printed QR codes remain legible on mobile devices

#### Scenario: Decoder initialization failure is surfaced to the user
- **WHEN** the self-hosted WebAssembly decoder fails to load or initialize
- **THEN** the scanner displays a visible error message in the camera banner instead of failing silently

### Requirement: Streamlined Purchase workflow
The Purchase workflow SHALL resolve scanned barcodes or product searches, pre-fill `Due Date` from `calculated_due_days` or `default_due_days`, show loading indicators during UPC lookup and LLM classification for unknown barcodes, pre-fill the variant name from the UPC title and collapsible measurements from LLM classification, allow selecting or creating a product with one or two barcodes, create items with calculated due dates, and trigger label printing per `label_print_mode`. When a scanned barcode resolves to an existing variant (`kind: "barcode"`), the Purchase workflow SHALL immediately use that mapped product and variant in the Confirm & Add step without calling OpenFoodFacts lookup or LLM classification, and SHALL cancel any in-flight unknown-barcode lookup/classification and clear stale lookup banners, classifier warnings, and product search hits. When an unknown barcode is classified by the LLM and returns a valid `matched_product_id`, the Purchase workflow SHALL automatically select that existing product in Confirm & Add (keeping the scanned barcode, pre-filled variant name, and variant measurement ready to attach as a new variant) and display a banner identifying the matched product with a one-click `"Create new product instead"` option that switches to the Create New form pre-filled with the LLM's suggested product name, category (if returned), and measurement while clearing the matched product's default location so the user must explicitly choose a location. When creating a new product in Purchase mode (from an unknown barcode, an unmatched text search, or clicking `"Create new product instead"`), the workflow SHALL NOT default `Category` or `Location` to the first item in their respective dropdowns when no default value exists: `Category` SHALL remain unselected unless populated by LLM classification (without overwriting a category already manually chosen by the user), `Location` SHALL remain unselected because a new product has no default location, and the workflow SHALL prevent submission until the user has selected both a valid `Category` and a valid `Location`. When the LLM returns no match or is disabled, the Purchase workflow SHALL let the user search and select an existing product or create a new product, and SHALL display live debounced similar-product matches as the user types a new product name so they can switch to an existing product in one click.

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

#### Scenario: Unknown barcode auto-selects LLM-matched existing product
- **WHEN** a user scans an unknown retail barcode in Purchase mode and `/api/upc/classify` returns `matched_product_id` for existing product `"Mustard, Dijon"`
- **THEN** the UI automatically selects `"Mustard, Dijon"` in Confirm & Add with the scanned barcode and pre-filled variant name/measurement ready to attach, displays a banner indicating the matched existing product, and provides a `"Create new product instead"` button

#### Scenario: Switching from auto-matched product to Create New
- **WHEN** the Purchase workflow auto-selected an LLM-matched existing product and the user clicks `"Create new product instead"`
- **THEN** the UI switches to the Create New Product form pre-filled with the LLM's suggested `product_name`, `category_id` (if returned), and measurements while preserving the scanned barcode and variant details, and resets `Location` to unselected so the user must choose a location before confirming

#### Scenario: Unknown barcode with no LLM match or disabled LLM supports searching or creating
- **WHEN** a user scans an unknown retail barcode in Purchase mode and LLM classification is disabled or returns `matched_product_id: null`
- **THEN** the UI lets the user search existing products by search terms (and displays any fuzzy matches) to attach the barcode to an existing product, or proceed to create a new product

#### Scenario: Typing a new product name in Purchase mode shows live similar products
- **WHEN** a user types a product name in the Purchase Create New form that resembles existing catalog products
- **THEN** the UI displays a debounced list of similar existing products and lets the user click one to switch to that existing product instead of creating a duplicate

#### Scenario: New product without LLM category or default location leaves dropdowns unselected and blocks submission
- **WHEN** a user enters the Purchase Create New Product form (via an unknown barcode when OpenFoodFacts has no match or LLM classification is disabled/returns `category_id: null`, or via a text search with zero results)
- **THEN** neither `Category` nor `Location` defaults to the first item in its dropdown, both display unselected placeholders, and `Confirm & Add` cannot be submitted (and no `/api/workflows/purchase` request is sent) until the user explicitly selects both a `Category` and a `Location`

#### Scenario: New product with LLM-classified category still requires explicit Location selection
- **WHEN** a user scans an unknown barcode in Purchase mode and LLM classification returns a valid `category_id` with `matched_product_id: null`
- **THEN** `Category` is pre-populated with the LLM-classified category (unless the user already manually selected a category while classification was in flight), `Location` remains unselected, and `Confirm & Add` remains blocked until the user selects a `Location`

#### Scenario: User-selected category is preserved when LLM classification completes later
- **WHEN** a user manually selects a `Category` in the Purchase Create New Product form while LLM classification is still in flight, and classification later resolves with a different `category_id`
- **THEN** the user's manually selected `Category` is preserved and not overwritten by the late LLM response

### Requirement: Consume and Open workflows with continuous scan and undo
In `Consume` or `Open` mode, scanning an in-stock `Item` QR (`/go/i/:id`) SHALL immediately consume or open the item with continuous scanning, duplicate-scan debounce, and a temporary Undo toast. In `Consume` mode, each scan SHALL trigger a brief visual flash alongside the audio beep. Scanning an already-consumed `Item` QR or UUID SHALL NOT overwrite `consumed_on_date` and SHALL display an already-consumed notice naming the item. Scanning a `Product`, `Barcode`, or `Location` SHALL list unconsumed items ordered by soonest `due_on_date`. Typing a non-barcode product search query SHALL search in-stock products; if multiple in-stock products match, the UI SHALL display a clickable `Matching Products` list (showing each product's name and category) so selecting a product loads its unconsumed items into the item selection list; if exactly one in-stock product matches, the UI SHALL load its unconsumed items directly; if none match, the UI SHALL display a clear no-match status message.

#### Scenario: Continuous item scan with undo
- **WHEN** a user scans `/go/i/<uuid>` for an unconsumed item in Consume mode and taps Undo on the confirmation toast
- **THEN** the item's `consumed_on_date` is cleared and the item returns to available stock

#### Scenario: Visual flash accompanies beep on Consume scan
- **WHEN** a user scans a barcode or QR code in Consume mode
- **THEN** a brief visual flash is triggered simultaneously with the scan beep (visible over the live camera viewfinder when enabled and on the scanner bar) and automatically clears after a short duration without blocking subsequent scans

#### Scenario: Scanning an already-consumed item displays already-consumed message with item name
- **WHEN** a user scans `/go/i/<id>` (or item UUID) in Consume mode for an item (e.g., `"Milk, Whole"`) that already has `consumed_on_date` set
- **THEN** the system does not overwrite the item's `consumed_on_date`, does not display a "Consumed" undo toast, and displays a message containing `"Milk, Whole"` stating that it was already consumed

#### Scenario: Unknown barcode in Consume mode
- **WHEN** a user scans an unrecognized retail barcode in Consume mode
- **THEN** the UI offers inline association of that barcode to an existing product without leaving the workflow

#### Scenario: Searching by product name with multiple matching in-stock products
- **WHEN** a user types a product name query (e.g., `"Bagel"`) in `Consume` or `Open` mode that matches multiple in-stock products
- **THEN** the UI displays a clickable `Matching Products` list showing up to 8 matching products with their category names, and clicking a product clears the matching-products list and loads that product's unconsumed items into the item selection list (with the soonest-due item pre-selected)

#### Scenario: Searching by product name with a single matching in-stock product
- **WHEN** a user types a product name query in `Consume` or `Open` mode that matches exactly one in-stock product
- **THEN** the UI directly loads that product's unconsumed items into the item selection list without requiring an extra product-picker click

#### Scenario: Searching by product name with no matching in-stock products
- **WHEN** a user types a product name query in `Consume` or `Open` mode that matches zero in-stock products
- **THEN** the UI displays a status message indicating no matching in-stock products were found and does not show a product-creation form

### Requirement: Transfer workflow
In `Transfer` mode, the user SHALL scan one or more `Item` QRs, `Product` QRs, or retail UPCs—or search for in-stock products by typing a product name—to stage in-stock items in a visible transfer list, then complete the transfer by scanning or keying in/selecting a destination `Location`. Scanning a `Product` QR SHALL list all in-stock items of that product for multi-select staging, and scanning a UPC SHALL list all in-stock items of that variant for multi-select staging. Typing a non-barcode product search query SHALL search in-stock products; if multiple in-stock products match, the UI SHALL display a clickable `Matching Products` list so selecting a product lists all of its in-stock items for multi-select staging; if exactly one in-stock product matches, the UI SHALL load its in-stock items directly for multi-select staging; if none match, the UI SHALL display a clear no-match status message. Completing the transfer SHALL move all staged items, apply freeze/thaw due-date rules, and clear the list.

#### Scenario: Batch transfer into a freezer location
- **WHEN** a user in Transfer mode scans two in-stock item QRs and then scans a destination location QR with `is_freezer=true`
- **THEN** both items appear in the visible transfer list as they are scanned, and scanning the location QR transfers both items to that location, applies `default_due_days_on_freeze` if configured, clears the transfer list, and displays a confirmation message

#### Scenario: Completing transfer by keying in or selecting a destination location
- **WHEN** a user in Transfer mode has one or more items in the visible transfer list, keys in or selects a destination location in the location selector, and confirms the transfer
- **THEN** all staged items are transferred to the selected destination location, the transfer list is cleared, and a confirmation message is displayed

#### Scenario: Scanning a product QR lists all in-stock items of that product for selection
- **WHEN** a user in Transfer mode scans a product QR (`/go/p/:id`) for a product with multiple in-stock items across variants or locations
- **THEN** the UI displays all in-stock items of that product and lets the user select one or more items to add to the visible transfer list without immediately executing the transfer

#### Scenario: Scanning a retail UPC lists all in-stock items of that variant for selection
- **WHEN** a user in Transfer mode scans a retail UPC associated with Variant A of a product that has in-stock items in both Variant A and Variant B
- **THEN** the UI displays only the in-stock items belonging to Variant A and lets the user select one or more of those items to add to the visible transfer list

#### Scenario: Removing a staged item before completing transfer
- **WHEN** a user removes an item from the visible transfer list and then completes the transfer to a destination location
- **THEN** only the remaining staged items are transferred to the destination location

#### Scenario: Scanning an already-consumed item in Transfer mode displays already-consumed notice
- **WHEN** a user in Transfer mode scans an item QR for an item (e.g., `"Milk, Whole"`) that already has `consumed_on_date` set
- **THEN** the item is not added to the transfer list and the UI displays a message containing `"Milk, Whole"` stating that it was already consumed

#### Scenario: Scanning a location QR with an empty transfer list prompts to scan items first
- **WHEN** a user in Transfer mode scans a destination location QR before any items are in the transfer list
- **THEN** no transfer is executed and the UI prompts the user to scan one or more items first

#### Scenario: Searching by product name with multiple matching in-stock products in Transfer mode
- **WHEN** a user types a product name query in `Transfer` mode that matches multiple in-stock products
- **THEN** the UI displays a clickable `Matching Products` list showing up to 8 matching products with their category names, and clicking a product clears the matching-products list and lists that product's in-stock items for multi-select staging into the transfer list (pre-selecting the first unstaged item)

#### Scenario: Searching by product name with a single matching in-stock product in Transfer mode
- **WHEN** a user types a product name query in `Transfer` mode that matches exactly one in-stock product
- **THEN** the UI directly lists that product's in-stock items for multi-select staging into the transfer list (pre-selecting the first unstaged item)

#### Scenario: Searching by product name with no matching in-stock products in Transfer mode
- **WHEN** a user types a product name query in `Transfer` mode that matches zero in-stock products
- **THEN** the UI displays a status message indicating no matching in-stock products were found

#### Scenario: Scanning an unrecognized numeric barcode in Transfer mode
- **WHEN** a user scans an unrecognized 6–14 digit retail barcode in `Transfer` mode
- **THEN** the UI displays `"Unrecognized barcode or QR code."` instead of performing a product-name text search

### Requirement: Inventory Audit workflow
In `Inventory` mode, the user SHALL select or scan a `Location`, scan all physically present items/products, review a reconciliation summary categorizing items to Consume, Transfer, Confirm, and Create, toggle checkboxes for any action, and apply all selected actions in one batch—applying freeze/thaw due-date rules on transfers and default/rolling-average due dates on created items with unset due dates.

#### Scenario: Reconciling a location audit
- **WHEN** a user finishes scanning a location and submits the reconciliation summary
- **THEN** the system atomically applies all selected consume, transfer (updating freeze/thaw due dates), and create actions and reports the summary counts

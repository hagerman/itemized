# Spec Delta: barcode-scanning

## MODIFIED Requirements

### Requirement: Streamlined Purchase workflow
The Purchase workflow SHALL resolve scanned barcodes or product searches, pre-fill `Due Date` from `calculated_due_days` or `default_due_days`, show loading indicators during UPC lookup and LLM classification for unknown barcodes, pre-fill the variant name from the UPC title and collapsible measurements from LLM classification, allow selecting or creating a product with one or two barcodes, create items with calculated due dates, and trigger label printing per `label_print_mode`. When a scanned barcode resolves to an existing variant (`kind: "barcode"`), the Purchase workflow SHALL immediately use that mapped product and variant in the Confirm & Add step without calling OpenFoodFacts lookup or LLM classification, and SHALL cancel any in-flight unknown-barcode lookup/classification and clear stale lookup banners, classifier warnings, and product search hits. When an unknown barcode is classified by the LLM and returns a valid `matched_product_id`, the Purchase workflow SHALL automatically select that existing product in Confirm & Add (keeping the scanned barcode, pre-filled variant name, and variant measurement ready to attach as a new variant) and display a banner identifying the matched product with a one-click `"Create new product instead"` option that switches to the Create New form pre-filled with the LLM's suggested product name, category, and measurement. When the LLM returns no match or is disabled, the Purchase workflow SHALL let the user search and select an existing product or create a new product, and SHALL display live debounced similar-product matches as the user types a new product name so they can switch to an existing product in one click.

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
- **THEN** the UI switches to the Create New Product form pre-filled with the LLM's suggested `product_name`, `category_id`, and measurements while preserving the scanned barcode and variant details

#### Scenario: Unknown barcode with no LLM match or disabled LLM supports searching or creating
- **WHEN** a user scans an unknown retail barcode in Purchase mode and LLM classification is disabled or returns `matched_product_id: null`
- **THEN** the UI lets the user search existing products by search terms (and displays any fuzzy matches) to attach the barcode to an existing product, or proceed to create a new product

#### Scenario: Typing a new product name in Purchase mode shows live similar products
- **WHEN** a user types a product name in the Purchase Create New form that resembles existing catalog products
- **THEN** the UI displays a debounced list of similar existing products and lets the user click one to switch to that existing product instead of creating a duplicate

## MODIFIED Requirements

### Requirement: Streamlined Purchase workflow
The Purchase workflow SHALL resolve scanned barcodes or product searches, pre-populate the `Due Date` input from the matched or selected product's rolling average (`calculated_due_days`) or `default_due_days`, invoke UPC lookup and optional LLM classification for unknown barcodes, allow selecting or creating a product with one or two barcodes, create items with calculated due dates, and trigger label printing per `label_print_mode`.

#### Scenario: Purchasing a known barcode
- **WHEN** a user scans a known retail barcode in Purchase mode for a product with `calculated_due_days = 34` (or `default_due_days = 34`)
- **THEN** the UI proceeds directly to the Confirm & Add step pre-populated with the matched product, variant, default quantity, default location, and `Due Date` set to `today + 34 days`

#### Scenario: Purchasing an unknown barcode
- **WHEN** a user scans an unknown retail barcode in Purchase mode
- **THEN** the system looks up the barcode via UPC lookup (and optional LLM classification), lets the user select or create a product, associates the barcode, creates the items, and triggers configured label printing

#### Scenario: Selecting an existing product from Purchase search pre-fills Due Date
- **WHEN** a user searches for or selects an existing product in Purchase mode that has a rolling-average or fixed default due days
- **THEN** the `Due Date` input is immediately pre-populated with `today + effectiveDueDays` while remaining editable before confirming

### Requirement: Inventory Audit workflow
In `Inventory` mode, the user SHALL select or scan a `Location`, scan all physically present items/products, review a reconciliation summary categorizing items to Consume, Transfer, Confirm, and Create, toggle checkboxes for any action, and apply all selected actions in one batch—applying freeze/thaw due-date rules on transfers and default/rolling-average due dates on created items with unset due dates.

#### Scenario: Reconciling a location audit
- **WHEN** a user finishes scanning a location and submits the reconciliation summary
- **THEN** the system atomically applies all selected consume, transfer (updating freeze/thaw due dates), and create actions and reports the summary counts

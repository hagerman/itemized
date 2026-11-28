## MODIFIED Requirements

### Requirement: Products, variants, and retail barcodes
The system SHALL store `Product` records with a category, default location, optional single measurement type (volume, weight, or length), due-date defaults (`default_due_days`, `default_due_days_on_open`, `default_due_days_on_freeze`, `default_due_days_on_thaw`, `use_average_for_due_date`), `label_print_mode` (`none`, `single`, `per_item`), `minimum_value`, and `manually_added_to_shopping_list`. Creating a new product or renaming an existing product to a name that matches another existing product case-insensitively (after trimming whitespace) SHALL be rejected with HTTP 409 Conflict including the conflicting product's `id` and `name`. Editing non-name fields of an existing product without changing its normalized name SHALL be permitted even if a pre-existing legacy duplicate exists in the database. Each `Product` MAY have multiple `Variant` records (with optional measurement overrides), and each `Variant` MAY have multiple globally unique `Barcode` records with a `default_quantity`. API responses that serialize `Variant` records (including `GET /api/products/:id` and variant creation/update responses) SHALL always include the `barcodes` field as a JSON array (`[]` when the variant has no barcodes) rather than omitting it.

#### Scenario: Enforce unique retail barcode
- **WHEN** a user attempts to associate a retail barcode that already exists on another variant
- **THEN** the system rejects the duplicate with HTTP 409 Conflict

#### Scenario: Enforce at most one measurement type
- **WHEN** a product or variant specifies values for more than one of volume, weight, or length
- **THEN** the system rejects the request with HTTP 422

#### Scenario: Reject creating a product with an exact case-insensitive duplicate name
- **WHEN** a product named `"Mustard, Dijon"` exists and a client submits `POST /api/products` or `POST /api/workflows/purchase` (with `new_product`) using `"  mustard, dijon  "`
- **THEN** the system rejects the request with HTTP 409 Conflict, includes the existing product's `id` and `name`, and does not create a duplicate product

#### Scenario: Reject renaming a product to another product's existing name
- **WHEN** products `"Apple, Gala"` (ID 1) and `"Apples, Gala"` (ID 2) exist and a client sends `PATCH /api/products/1` with `name: "apples, gala"`
- **THEN** the system rejects the request with HTTP 409 Conflict and leaves both products unchanged

#### Scenario: Editing metadata on a product without changing its name remains allowed
- **WHEN** a database contains a legacy duplicate product name and a client sends `PATCH /api/products/{id}` changing `default_location_id` while keeping the same normalized `name`
- **THEN** the system persists the metadata update and returns HTTP 200

#### Scenario: Variant with zero barcodes serializes an empty array
- **WHEN** a product has a variant with no associated barcodes and a client requests `GET /api/products/{id}`
- **THEN** the variant object in the JSON response includes `"barcodes": []`

### Requirement: Individual item lifecycle and due-date rules
The system SHALL track physical units as `Item` records with integer primary keys, optional `legacy_uuid`, `product_id`, optional `variant_id`, `location_id`, purchase/open/due/consumed dates, and `notes`. `Product` and `Location` records SHALL use integer IDs and optional unique `legacy_uuid`. When `use_average_for_due_date` is enabled on a product, the system SHALL expose its rolling-average `calculated_due_days` from the last `due_date_average_count` purchases. Updating an item via `PATCH /api/items/:id` with a `notes` field SHALL trim leading and trailing whitespace and store `null` when the resulting value is empty or explicitly `null`.

#### Scenario: Automatic due-date calculation on purchase
- **WHEN** an item is created without an explicit `due_on_date` and the product has `use_average_for_due_date` enabled
- **THEN** the system computes `due_on_date` from the average offset of the most recent `N` items (where `N` is the instance `due_date_average_count` setting, defaulting to 3), falling back to `default_due_days`

#### Scenario: Opening an item recalculates due date
- **WHEN** an item is marked opened and its product defines `default_due_days_on_open`
- **THEN** the system sets `opened_on_date` and updates `due_on_date` based on the open date plus `default_due_days_on_open` when earlier than the existing due date (or when unset)

#### Scenario: Freezing or thawing recalculates due date
- **WHEN** an item is transferred into a location with `is_freezer=true` from a non-freezer location (or vice versa)
- **THEN** the system updates `due_on_date` using `default_due_days_on_freeze` or `default_due_days_on_thaw` when configured on the product

#### Scenario: Calculated rolling-average due days exposed on product
- **WHEN** a product has `use_average_for_due_date = true` and recent purchased items with offsets of 10, 12, and 8 days (with `due_date_average_count = 3`)
- **THEN** `GET /api/products/:id` returns `calculated_due_days = 10`

#### Scenario: Updating and clearing item notes
- **WHEN** a client sends `PATCH /api/items/{id}` with `{"notes": "  Opened for soup  "}`
- **THEN** the system persists `"Opened for soup"` and returns HTTP 200 with the updated item
- **AND** when a client subsequently sends `PATCH /api/items/{id}` with `{"notes": "   "}` or `{"notes": null}`
- **THEN** the system clears `notes` to `null` and returns HTTP 200

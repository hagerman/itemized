# Spec Delta

## MODIFIED Requirements

### Requirement: Individual item lifecycle and due-date rules
The system SHALL track physical units as `Item` records with integer primary keys, optional `legacy_uuid`, `product_id`, optional `variant_id`, `location_id`, purchase/open/due/consumed dates, and `notes`. `Product` and `Location` records SHALL use integer IDs and optional unique `legacy_uuid`. When `use_average_for_due_date` is enabled on a product, the system SHALL expose its rolling-average `calculated_due_days` from the last `due_date_average_count` purchases. Updating an item via `PATCH /api/items/:id` with a `notes` field SHALL trim leading and trailing whitespace and store `null` when the resulting value is empty or explicitly `null`. Opening an item via `POST /api/items/:id/open` SHALL NOT overwrite `opened_on_date` or `due_on_date` (and SHALL NOT trigger label reprints) when the item already has `opened_on_date` set, returning HTTP 200 with `already_opened: true` and the unchanged item; a fresh open SHALL return HTTP 200 with `already_opened: false`. Bulk opening via `POST /api/items/bulk` (`action: "open"`) SHALL skip items that already have `opened_on_date` or `consumed_on_date` set.

#### Scenario: Automatic due-date calculation on purchase
- **WHEN** an item is created without an explicit `due_on_date` and the product has `use_average_for_due_date` enabled
- **THEN** the system computes `due_on_date` from the average offset of the most recent `N` items (where `N` is the instance `due_date_average_count` setting, defaulting to 3), falling back to `default_due_days`

#### Scenario: Opening an item recalculates due date
- **WHEN** an unopened item is marked opened via `POST /api/items/:id/open` and its product defines `default_due_days_on_open`
- **THEN** the system sets `opened_on_date`, updates `due_on_date` based on the open date plus `default_due_days_on_open` when earlier than the existing due date (or when unset), and returns HTTP 200 with `already_opened: false`

#### Scenario: Re-opening an already-opened item preserves dates and reports already_opened
- **WHEN** a client sends `POST /api/items/:id/open` for an item that already has `opened_on_date` set (e.g., `"2026-11-20"`)
- **THEN** the system leaves `opened_on_date` and `due_on_date` unchanged, does not trigger label reprints, and returns HTTP 200 with `already_opened: true` and `item` equal to `previous`

#### Scenario: Bulk open skips already-opened items
- **WHEN** a client sends `POST /api/items/bulk` with `action: "open"` containing one unopened item and one already-opened item
- **THEN** only the unopened item is marked opened (and counted in `processed`), while the already-opened item's `opened_on_date` and `due_on_date` remain unchanged

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

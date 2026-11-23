## MODIFIED Requirements

### Requirement: Individual item lifecycle and due-date rules
The system SHALL track physical units as `Item` records with integer primary keys, optional `legacy_uuid`, `product_id`, optional `variant_id`, `location_id`, purchase/open/due/consumed dates, and `notes`. `Product` and `Location` records SHALL use integer IDs and optional unique `legacy_uuid`. When `use_average_for_due_date` is enabled on a product, the system SHALL expose its rolling-average `calculated_due_days` from the last `due_date_average_count` purchases.

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

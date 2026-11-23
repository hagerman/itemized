# Spec Delta

## Purpose

Defines the shared single-household inventory catalog, including hierarchical categories and locations, products, variants, retail barcodes, individual tracked items, due-date rules, shopping list calculation, and fuzzy product search.

## ADDED Requirements

### Requirement: Shared single-household inventory scope
All authenticated household users SHALL share a single inventory namespace without multi-collection scoping.

#### Scenario: Multiple users view and mutate the same inventory
- **WHEN** user A creates a product or item and user B queries the inventory
- **THEN** user B sees the exact same product and item

### Requirement: Hierarchical categories and locations
The system SHALL support nested `Category` and `Location` trees via optional `parent_id` references, and each `Location` SHALL support an `is_freezer` flag.

#### Scenario: Location hierarchy display and freezer flag
- **WHEN** a location has a parent location and `is_freezer` set to true
- **THEN** the system preserves the hierarchy path and exposes `is_freezer` for transfer due-date calculations

### Requirement: Products, variants, and retail barcodes
The system SHALL store `Product` records with a category, default location, optional single measurement type (volume, weight, or length), due-date defaults (`default_due_days`, `default_due_days_on_open`, `default_due_days_on_freeze`, `default_due_days_on_thaw`, `use_average_for_due_date`), `label_print_mode` (`none`, `single`, `per_item`), `minimum_value`, and `manually_added_to_shopping_list`. Each `Product` MAY have multiple `Variant` records (with optional measurement overrides), and each `Variant` MAY have multiple globally unique `Barcode` records with a `default_quantity`.

#### Scenario: Enforce unique retail barcode
- **WHEN** a user attempts to associate a retail barcode that already exists on another variant
- **THEN** the system rejects the duplicate with HTTP 409 Conflict

#### Scenario: Enforce at most one measurement type
- **WHEN** a product or variant specifies values for more than one of volume, weight, or length
- **THEN** the system rejects the request with HTTP 422

### Requirement: Individual item lifecycle and due-date rules
The system SHALL track physical units as `Item` records with integer primary keys, optional `legacy_uuid`, `product_id`, optional `variant_id`, `location_id`, `purchased_on_date`, `opened_on_date`, `due_on_date`, `consumed_on_date`, and `notes`. `Product` and `Location` records SHALL also use integer primary keys and support an optional unique `legacy_uuid` for migrated records.

#### Scenario: Automatic due-date calculation on purchase
- **WHEN** an item is created without an explicit `due_on_date` and the product has `use_average_for_due_date` enabled
- **THEN** the system computes `due_on_date` from the average offset of the most recent `N` items (where `N` is the instance `due_date_average_count` setting, defaulting to 3), falling back to `default_due_days`

#### Scenario: Opening an item recalculates due date
- **WHEN** an item is marked opened and its product defines `default_due_days_on_open`
- **THEN** the system sets `opened_on_date` and updates `due_on_date` based on the open date plus `default_due_days_on_open` when earlier than the existing due date (or when unset)

#### Scenario: Freezing or thawing recalculates due date
- **WHEN** an item is transferred into a location with `is_freezer=true` from a non-freezer location (or vice versa)
- **THEN** the system updates `due_on_date` using `default_due_days_on_freeze` or `default_due_days_on_thaw` when configured on the product

### Requirement: Shopping list and stock status filters
The system SHALL compute stock counts from unconsumed items (`consumed_on_date IS NULL`), identify low-stock products (`in_stock_count < minimum_value`), overdue items, due-soon items, and include a product on the shopping list when either `manually_added_to_shopping_list` is true or it is low stock.

#### Scenario: Low-stock product appears on shopping list
- **WHEN** a product has `minimum_value = 2` and 1 unconsumed item
- **THEN** the product is included in the shopping list with a low-stock shortage of 1

### Requirement: Fuzzy product search
The system SHALL support case-insensitive substring and fuzzy search over product names with results ordered by relevance.

#### Scenario: Partial substring product search
- **WHEN** a user searches for a partial product name (e.g., `"cash"` for `"Nuts, Cashews, Whole"`)
- **THEN** the system returns matching products including `"Nuts, Cashews, Whole"`

### Requirement: Instance settings
The system SHALL persist instance-wide configuration in `Setting` records, including `base_url` (for QR code generation), `due_date_average_count`, optional LLM settings, and optional OIDC settings.

#### Scenario: Updating due-date average count
- **WHEN** an administrator updates `due_date_average_count` in settings
- **THEN** subsequent average due-date calculations use the updated value

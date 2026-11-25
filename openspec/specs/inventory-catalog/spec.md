# inventory-catalog Specification

## Purpose

Defines the shared single-household inventory catalog, including hierarchical categories and locations, products, variants, retail barcodes, individual tracked items, due-date rules, shopping list calculation, and fuzzy product search.

## Requirements

### Requirement: Shared single-household inventory scope
All authenticated household users SHALL share a single inventory namespace without multi-collection scoping.

#### Scenario: Multiple users view and mutate the same inventory
- **WHEN** user A creates a product or item and user B queries the inventory
- **THEN** user B sees the exact same product and item

### Requirement: Hierarchical categories and locations
The system SHALL support nested `Category` and `Location` trees via optional `parent_id` references and an `is_freezer` flag on each `Location`. Updating a `Category` or `Location` SHALL support renaming, changing or clearing `parent_id`, and toggling `is_freezer` (for locations), while rejecting blank names and self- or descendant-parent cycles with HTTP 422 Unprocessable Entity.

#### Scenario: Location hierarchy display and freezer flag
- **WHEN** a location has a parent location and `is_freezer` set to true
- **THEN** the system preserves the hierarchy path and exposes `is_freezer` for transfer due-date calculations

#### Scenario: Updating a category name and parent
- **WHEN** a client sends `PATCH /api/categories/{id}` with a new non-empty `name` and a valid `parent_id` (or `null` for top-level)
- **THEN** the system persists the updated `name` and `parent_id` and returns HTTP 200 with the updated category including its recomputed `hierarchy_name`

#### Scenario: Updating a location name, parent, and freezer flag
- **WHEN** a client sends `PATCH /api/locations/{id}` with a new non-empty `name`, a valid `parent_id` (or `null` for top-level), and an updated `is_freezer` boolean
- **THEN** the system persists all three fields and returns HTTP 200 with the updated location including its recomputed `hierarchy_name` and `is_freezer` value

#### Scenario: Rejecting blank name on category or location update
- **WHEN** a client sends `PATCH /api/categories/{id}` or `PATCH /api/locations/{id}` with an empty or whitespace-only `name`
- **THEN** the system rejects the request with HTTP 422 Unprocessable Entity and leaves the stored record unchanged

#### Scenario: Rejecting self-parenting or descendant cycle on update
- **WHEN** `Kitchen` contains child `Fridge` which contains grandchild `Top Shelf`, and a client sends `PATCH /api/locations/{kitchen_id}` with `parent_id` set to `kitchen_id`, `fridge_id`, or `top_shelf_id` (or performs the equivalent cycle update on categories)
- **THEN** the system rejects the request with HTTP 422 Unprocessable Entity and leaves the hierarchy unchanged

### Requirement: Products, variants, and retail barcodes
The system SHALL store `Product` records with a category, default location, optional single measurement type (volume, weight, or length), due-date defaults (`default_due_days`, `default_due_days_on_open`, `default_due_days_on_freeze`, `default_due_days_on_thaw`, `use_average_for_due_date`), `label_print_mode` (`none`, `single`, `per_item`), `minimum_value`, and `manually_added_to_shopping_list`. Each `Product` MAY have multiple `Variant` records (with optional measurement overrides), and each `Variant` MAY have multiple globally unique `Barcode` records with a `default_quantity`.

#### Scenario: Enforce unique retail barcode
- **WHEN** a user attempts to associate a retail barcode that already exists on another variant
- **THEN** the system rejects the duplicate with HTTP 409 Conflict

#### Scenario: Enforce at most one measurement type
- **WHEN** a product or variant specifies values for more than one of volume, weight, or length
- **THEN** the system rejects the request with HTTP 422

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

### Requirement: Shopping list and stock status filters
The system SHALL compute stock counts from unconsumed items (`consumed_on_date IS NULL`), determine each product's `next_due_on_date` and `next_location_name` from the unconsumed item with the soonest due date (treating unset due dates last and breaking ties by first entered), identify low-stock (`in_stock_count < minimum_value`), overdue, and due-soon products, and include a product on the shopping list when `manually_added_to_shopping_list` is true or it is low stock.

#### Scenario: Low-stock product appears on shopping list
- **WHEN** a product has `minimum_value = 2` and 1 unconsumed item
- **THEN** the product is included in the shopping list with a low-stock shortage of 1

#### Scenario: Next location reflects soonest-due unconsumed item
- **WHEN** a product's default location is `"Pantry"` and it has two unconsumed items: item A in `"Garage"` due `2026-12-20` and item B in `"Fridge"` due `2026-12-05`
- **THEN** the product's `next_location_name` is `"Fridge"`

#### Scenario: Tie-breaking when due dates are equal or unset
- **WHEN** a product has two unconsumed items with no due date (or the same due date), with item 1 entered first in `"Kitchen"` and item 2 entered later in `"Garage"`
- **THEN** the product's `next_location_name` is `"Kitchen"` (the first item entered)

### Requirement: Fuzzy product search
The system SHALL support case-insensitive substring and fuzzy search over product names with results ordered by relevance.

#### Scenario: Partial substring product search
- **WHEN** a user searches for a partial product name (e.g., `"cash"` for `"Nuts, Cashews, Whole"`)
- **THEN** the system returns matching products including `"Nuts, Cashews, Whole"`

### Requirement: Instance settings
The system SHALL persist instance-wide configuration in `Setting` records, including `base_url` (for QR code generation), `due_date_average_count`, optional LLM settings, and optional OIDC settings. Updating instance settings (`PATCH /api/settings`) SHALL be restricted to authenticated administrators.

#### Scenario: Updating due-date average count
- **WHEN** an administrator updates `due_date_average_count` in settings
- **THEN** subsequent average due-date calculations use the updated value

#### Scenario: Non-admin attempts to update instance settings
- **WHEN** an authenticated `member` sends `PATCH /api/settings`
- **THEN** the system rejects the request with HTTP 403 Forbidden and leaves stored settings unchanged

### Requirement: Bounded batch item creation
Item creation, purchase workflow, and inventory-apply endpoints SHALL enforce a maximum `quantity` of 500 items per request to prevent accidental or abusive database and print-job exhaustion.

#### Scenario: Excessive item quantity rejected
- **WHEN** a client submits `quantity > 500` to `POST /api/items`, `POST /api/workflows/purchase`, or `POST /api/workflows/inventory/apply`
- **THEN** the system rejects the request with HTTP 422 Unprocessable Entity without creating items or triggering print jobs

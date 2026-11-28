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

### Requirement: Product list sorting
`GET /api/products` SHALL support sorting results via the `sort` query parameter across all six inventory table columns: `name` (default), `category`, `location`, `stock`, `due_date`, and `shopping_list`. Unknown or omitted `sort` values SHALL preserve the default order (case-insensitive `name` ascending, or fuzzy search relevance when `q` is non-empty).

#### Scenario: Sorting products by category
- **WHEN** a client requests `GET /api/products?sort=category`
- **THEN** products are ordered by `category_name` ascending (case-insensitive), with empty category names placed last and ties broken by `name` ascending (case-insensitive)

#### Scenario: Sorting products by location
- **WHEN** a client requests `GET /api/products?sort=location`
- **THEN** products are ordered by `next_location_name` ascending (case-insensitive), with products lacking a `next_location_name` placed last and ties broken by `name` ascending (case-insensitive)

#### Scenario: Sorting products by stock count
- **WHEN** a client requests `GET /api/products?sort=stock`
- **THEN** products are ordered by `in_stock_count` descending with ties broken by `name` ascending (case-insensitive)

#### Scenario: Sorting products by next due date
- **WHEN** a client requests `GET /api/products?sort=due_date`
- **THEN** products are ordered by `next_due_on_date` ascending (soonest due first), with products lacking a due date placed last and ties broken by `name` ascending (case-insensitive)

#### Scenario: Sorting products by shopping list status
- **WHEN** a client requests `GET /api/products?sort=shopping_list`
- **THEN** products with `on_shopping_list = true` appear before products with `on_shopping_list = false`, with shopping-list products ordered by `low_stock_amount` descending (higher shortage first, manually added with no shortage after) and remaining ties broken by `name` ascending (case-insensitive)

### Requirement: Fuzzy product search
The system SHALL support case-insensitive fuzzy and multi-word search on `GET /api/products?q=...`. Text queries SHALL strip punctuation, match via trigram similarity (`>= 0.3`), per-word typo similarity (`>= 0.4` for 3+ char tokens), or all-keyword substrings in any order, return empty if punctuation-only, and sort by tier (exact → prefix → whole-word → substring → fuzzy), similarity desc, then name asc (unless an explicit non-name `sort` of `category`, `location`, `stock`, `due_date`, or `shopping_list` is requested). Numeric 8–14 digit queries SHALL check barcodes first.

#### Scenario: Partial substring product search
- **WHEN** a user searches for a partial product name (e.g., `"cash"` for `"Nuts, Cashews, Whole"`)
- **THEN** the system returns matching products including `"Nuts, Cashews, Whole"`

#### Scenario: Reordered words and omitted punctuation
- **WHEN** a product named `"Chicken, Popcorn, Fried"` exists and a user searches for `"Fried Chicken Popcorn"`
- **THEN** the system returns `"Chicken, Popcorn, Fried"`

#### Scenario: Query with extra descriptive words
- **WHEN** a product named `"Chicken, Popcorn, Fried"` exists and a user searches for `"Chicken, Popcorn, Fried, Original"`
- **THEN** the system returns `"Chicken, Popcorn, Fried"` via trigram similarity

#### Scenario: Multi-word order-independent keyword match
- **WHEN** a product named `"Nuts, Cashews, Whole"` exists and a user searches for `"whole nuts"`
- **THEN** the system returns `"Nuts, Cashews, Whole"`

#### Scenario: Typo tolerance via trigram similarity
- **WHEN** products `"Cashews"` and `"Chicken, Popcorn, Fried"` exist and a user searches for `"Cashewz"` or `"chiken"`
- **THEN** `"Cashewz"` returns `"Cashews"` and `"chiken"` returns `"Chicken, Popcorn, Fried"`

#### Scenario: Tiered relevance ordering
- **WHEN** products `"Milk"`, `"Milk, Whole"`, `"Almond Milk, Unsweetened"`, and `"Buttermilk"` exist and a user searches for `"Milk"`
- **THEN** results are ordered `"Milk"` (exact), `"Milk, Whole"` (prefix), `"Almond Milk, Unsweetened"` (whole word), `"Buttermilk"` (substring)

#### Scenario: Punctuation-only query returns no results
- **WHEN** a user searches for `",,,---"`
- **THEN** the system returns an empty product list

#### Scenario: Barcode query matches associated product
- **WHEN** a product has a variant with barcode `"012345678905"` and a user searches `GET /api/products?q=0012345678905` (13-digit EAN-13 with leading zero) or `q=012345678905`
- **THEN** the system returns that product

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

### Requirement: Product merging and merge aliases
The system SHALL provide `POST /api/products/merge` accepting a `target_product_id` and a non-empty list of distinct `source_product_ids` (all referring to existing products, none equal to `target_product_id`). In a single atomic transaction, the system SHALL move all `Variant` records (along with their associated `Barcode` records) and all `Item` records (both unconsumed and consumed) from the source products to the target product, preserve the target product's own metadata, repoint any existing merge aliases whose target is one of the source products to the new `target_product_id`, record a merge alias for each source product's integer ID and optional `legacy_uuid` pointing to `target_product_id`, and delete the source products. Newly created products SHALL NOT reuse an integer ID that is recorded as a merged source product ID.

#### Scenario: Merging two or more products into a destination product
- **WHEN** a client sends `POST /api/products/merge` with `target_product_id` set to Product A and `source_product_ids` containing Product B and Product C
- **THEN** all variants (and their retail barcodes) and all items (unconsumed and consumed) from Product B and Product C are reassigned to Product A, Product B and Product C are deleted, merge aliases are stored mapping Product B's and Product C's integer IDs and optional `legacy_uuid` values to Product A, and the endpoint returns HTTP 200 with the updated destination product

#### Scenario: Chained merge repoints prior merge aliases
- **WHEN** Product A is merged into Product B, and later Product B is merged into Product C
- **THEN** Product A's existing merge alias is repointed directly to Product C alongside Product B's new merge alias, so both Product A's and Product B's IDs and legacy UUIDs resolve to Product C

#### Scenario: Newly created product does not reuse a merged product ID
- **WHEN** the highest-ID product in the catalog (e.g., ID `50`) is merged into another product and deleted, and a user subsequently creates a new product
- **THEN** the newly created product receives an integer ID greater than `50` so that the merged alias for ID `50` remains unambiguous

#### Scenario: Rejecting invalid merge requests atomically
- **WHEN** a client sends `POST /api/products/merge` with empty `source_product_ids`, with `target_product_id` included in `source_product_ids`, or with a non-existent target or source product ID
- **THEN** the system rejects the request with HTTP 422 Unprocessable Entity (for invalid input) or HTTP 404 Not Found (for missing products) and leaves all products, variants, items, and merge aliases unchanged

### Requirement: Atomic bulk product rename and merge reclassification
`POST /api/products/reclassify/apply` SHALL accept a non-empty list of `{ "product_id", "new_name" }` entries and apply them in one atomic transaction grouped by case-insensitive trimmed `new_name`. Each group SHALL merge into an unselected existing product with that name if one exists; otherwise it SHALL pick a deterministic survivor (most in-stock items, then most variants, then lowest ID), rename it, and merge the rest using `POST /api/products/merge` semantics.

#### Scenario: Bulk renaming non-colliding products atomically
- **WHEN** a client sends `POST /api/products/reclassify/apply` with two products whose trimmed target names are distinct and do not match any other existing product
- **THEN** both products are renamed to their target names in a single transaction and the endpoint returns HTTP 200 with rename/merge counts

#### Scenario: Colliding target names within the batch merge into deterministic survivor
- **WHEN** Product A (ID 10, 3 in-stock items) and Product B (ID 5, 1 in-stock item) are both submitted to `POST /api/products/reclassify/apply` with `new_name: "Apples, Gala"` and no other product has that name
- **THEN** Product A is chosen as the survivor (higher in-stock item count), renamed to `"Apples, Gala"`, Product B's variants, barcodes, and items are reassigned to Product A, a merge alias is recorded from Product B to Product A, and Product B is deleted

#### Scenario: Target name matching an unselected existing product merges into that existing product
- **WHEN** unselected Product X (`"Chicken, Breast"`) already exists and a client submits Product Y (`"Meat, Chicken, Breast"`) to `POST /api/products/reclassify/apply` with `new_name: "Chicken, Breast"`
- **THEN** Product Y is merged into Product X (repointing variants, barcodes, items, and merge aliases) and Product Y is deleted while Product X's metadata is preserved

#### Scenario: Invalid bulk reclassify apply request rolls back atomically
- **WHEN** a client sends `POST /api/products/reclassify/apply` containing a blank `new_name` or a non-existent `product_id`
- **THEN** the system rejects the request with HTTP 422 Unprocessable Entity or HTTP 404 Not Found and leaves all products, variants, items, and merge aliases unchanged

### Requirement: Idempotent starter taxonomy seeding
The system SHALL provide `POST /api/onboarding/starter-taxonomy` for authenticated users to atomically seed curated grocery-store categories (`Groceries`, `Household`) and universal household locations (`Kitchen`, `Garage`, `Bathroom`, `Laundry` with freezer flags). It SHALL accept optional `categories` and `locations` booleans (defaulting to `true`), skip existing case-insensitive trimmed names under the same parent, and return HTTP 200 with created counts.

#### Scenario: Loading full starter taxonomy on a fresh instance
- **WHEN** an authenticated user sends `POST /api/onboarding/starter-taxonomy` with an empty body `{}` on an instance with zero categories and zero locations
- **THEN** the system inserts the curated `Groceries` and `Household` category trees and the `Kitchen`, `Garage`, `Bathroom`, and `Laundry` location trees (with `Kitchen > Freezer` and `Garage > Chest Freezer` marked `is_freezer = true`) in a single transaction
- **AND** returns HTTP 200 with `categories_created > 0` and `locations_created > 0`

#### Scenario: Re-running starter taxonomy is idempotent
- **WHEN** an authenticated user sends `POST /api/onboarding/starter-taxonomy` after starter taxonomy (or a subset of matching category/location names) already exists
- **THEN** existing categories and locations matching by case-insensitive trimmed name under the same parent are preserved without creating duplicates
- **AND** only missing starter nodes are inserted, returning HTTP 200 with accurate created counts (including `0` when all starter nodes already exist)

#### Scenario: Loading only categories or only locations
- **WHEN** an authenticated user sends `POST /api/onboarding/starter-taxonomy` with `{ "categories": true, "locations": false }` (or vice versa)
- **THEN** the system seeds only the requested taxonomy type and leaves the other table untouched

#### Scenario: Unauthenticated request is rejected
- **WHEN** an unauthenticated client sends `POST /api/onboarding/starter-taxonomy`
- **THEN** the system rejects the request with HTTP 401 Unauthorized

### Requirement: Quick consume next-due item for a product
The system SHALL provide `POST /api/products/{id}/consume-next` to consume the soonest-due unconsumed item for the specified product (using the existing FEFO order: soonest `due_on_date`, unset due dates last, ties broken by oldest `id`). The endpoint SHALL return HTTP 200 with `{ "item", "previous" }` for undo support, HTTP 404 when the product does not exist, and HTTP 409 when the product has no unconsumed items in stock.

#### Scenario: Consuming the soonest-due item of a product
- **WHEN** a product has unconsumed item A (due `2026-12-20`) and item B (due `2026-12-05`), and an authenticated user sends `POST /api/products/{id}/consume-next`
- **THEN** the system sets `consumed_on_date` on item B (leaving item A unconsumed) and returns HTTP 200 with the updated `item` and its unconsumed `previous` state

#### Scenario: Tie-breaking when due dates are unset or equal
- **WHEN** a product has two unconsumed items with unset due dates (item 1 created before item 2) and a client sends `POST /api/products/{id}/consume-next`
- **THEN** the system consumes item 1 (the earliest-entered item) and returns HTTP 200

#### Scenario: Consuming when product has no in-stock items
- **WHEN** a client sends `POST /api/products/{id}/consume-next` for an existing product with zero unconsumed items
- **THEN** the system responds with HTTP 409 Conflict without modifying any records

#### Scenario: Consuming a non-existent product
- **WHEN** a client sends `POST /api/products/{id}/consume-next` for a product ID that does not exist
- **THEN** the system responds with HTTP 404 Not Found

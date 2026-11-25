# Spec Delta: inventory-catalog

## MODIFIED Requirements

### Requirement: Products, variants, and retail barcodes
The system SHALL store `Product` records with a category, default location, optional single measurement type (volume, weight, or length), due-date defaults (`default_due_days`, `default_due_days_on_open`, `default_due_days_on_freeze`, `default_due_days_on_thaw`, `use_average_for_due_date`), `label_print_mode` (`none`, `single`, `per_item`), `minimum_value`, and `manually_added_to_shopping_list`. Creating a new product or renaming an existing product to a name that matches another existing product case-insensitively (after trimming whitespace) SHALL be rejected with HTTP 409 Conflict including the conflicting product's `id` and `name`. Editing non-name fields of an existing product without changing its normalized name SHALL be permitted even if a pre-existing legacy duplicate exists in the database. Each `Product` MAY have multiple `Variant` records (with optional measurement overrides), and each `Variant` MAY have multiple globally unique `Barcode` records with a `default_quantity`.

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

## ADDED Requirements

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

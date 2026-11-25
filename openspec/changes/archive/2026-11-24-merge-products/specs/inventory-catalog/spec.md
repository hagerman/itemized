# Spec Delta

## ADDED Requirements

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

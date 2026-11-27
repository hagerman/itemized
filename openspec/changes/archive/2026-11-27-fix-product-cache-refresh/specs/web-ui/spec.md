# Spec Delta

## ADDED Requirements

### Requirement: Immediate client-side refresh after product create, edit, and inventory mutations
When a user creates, edits, or deletes a product—or mutates product or item records from any inventory view or workflow—the web application SHALL immediately reflect the updated records across the Product detail view, inventory list views, sidebar status counts, desktop Quick Search, mobile `/search`, and Location detail views without requiring a manual browser reload.

#### Scenario: Editing a product immediately displays updated details on the Product detail page
- **WHEN** a user opens `/products/:id`, clicks Edit to open `/products/:id/edit`, changes the product's name or metadata, and clicks Save
- **THEN** the application navigates back to `/products/:id` and immediately displays the updated product name and metadata without requiring a browser reload

#### Scenario: Editing a product refreshes inventory lists, search results, and location views
- **WHEN** a user edits a product's name or metadata on `/products/:id/edit` and saves, and then navigates to an inventory list (`/`), opens Quick Search or `/search`, or visits a Location detail page (`/locations/:id`) containing items of that product
- **THEN** those views display the updated product name and metadata without requiring a browser reload

#### Scenario: Creating a new product refreshes inventory lists, sidebar counts, and search results
- **WHEN** a user creates a new product via `/products/new` and clicks Save
- **THEN** the application navigates to `/products/:id` displaying the new product, and sidebar status counts, inventory list views (such as `All Items` or `Shopping List`), and Quick Search / `/search` results reflect the newly created product without requiring a browser reload

#### Scenario: Deleting, merging, reclassifying, or scanning products refreshes dependent views
- **WHEN** a user deletes a product from `/products/:id`, performs bulk delete/merge/reclassify on `/`, or creates/updates products or items via `Scan / Action` or `/go/:kind/:id`
- **THEN** all dependent cached views (Product detail, inventory lists, sidebar counts, Quick Search / `/search`, and Location detail views) refresh automatically without requiring a browser reload

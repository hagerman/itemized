## MODIFIED Requirements

### Requirement: Product detail view and bulk item management
The Product detail view SHALL display product metadata (including human-readable `Label Mode` names such as `One label per item`, `Single product label`, and `No label` instead of raw slugs), due-date rules, variants, and retail barcodes, provide header actions (toggle Shopping List, print Product label, Edit, Delete), and list individual `Item` records with single-item and multi-select bulk actions.

#### Scenario: Bulk transfer of selected items
- **WHEN** a user selects multiple unconsumed items on a Product detail page and applies a bulk Transfer to a target location
- **THEN** all selected items update to the target location and the UI refreshes immediately without a full page reload

#### Scenario: Displaying human-readable Label Mode on Product detail page
- **WHEN** a user views `/products/:id` for a product with `label_print_mode = "per_item"`
- **THEN** the `Label Mode` metadata tile displays `One label per item` instead of `per_item`

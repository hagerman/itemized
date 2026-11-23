## MODIFIED Requirements

### Requirement: Product detail view and bulk item management
The Product detail view SHALL display product metadata, due-date rules (rendering `Default Due Days` as `~X` from `calculated_due_days` when rolling average is enabled), variants, and associated retail barcodes, provide header actions (toggle Shopping List, print Product label, Edit, Delete), and list individual `Item` records with both single-item and multi-select bulk actions (consume, open, transfer, edit due date, reprint labels).

#### Scenario: Bulk transfer of selected items
- **WHEN** a user selects multiple unconsumed items on a Product detail page and applies a bulk Transfer to a target location
- **THEN** all selected items update to the target location and the UI refreshes immediately without a full page reload

#### Scenario: Displaying rolling-average default due days as ~X
- **WHEN** a user views `/products/:id` for a product with `use_average_for_due_date = true` and `calculated_due_days = 14`
- **THEN** the `Default Due Days` metadata tile displays `~14` (and displays `—` when no qualifying purchase history exists yet)

## ADDED Requirements

### Requirement: Rolling-average due-days default and manual input lock
When creating a new product (in the Product form or the Purchase scanner workflow), the `Calculate due date from rolling average of recent purchases` option SHALL be checked by default, and whenever that option is checked, the manual `Due Days` input SHALL be disabled so the user cannot enter a manual value.

#### Scenario: Creating a new product defaults rolling average to checked and disables Due Days
- **WHEN** a user opens `/products/new` (or creates a new product in Purchase mode)
- **THEN** the rolling-average checkbox is checked by default and the `Due Days` input is disabled until the user unchecks the rolling-average option

#### Scenario: Unchecking rolling average re-enables manual Due Days entry
- **WHEN** a user unchecks the rolling-average checkbox on the Product form
- **THEN** the `Due Days` input becomes enabled and its entered value is saved as `default_due_days`

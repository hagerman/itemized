## MODIFIED Requirements

### Requirement: Product detail view and bulk item management
The Product detail view SHALL display product metadata (including the product's default measurement when set), due-date rules, variants, and associated retail barcodes, provide header actions (toggle Shopping List, print Product label, Edit, Delete), and list individual `Item` records with both single-item and multi-select bulk actions (consume, open, transfer, edit due date, reprint labels).

#### Scenario: Bulk transfer of selected items
- **WHEN** a user selects multiple unconsumed items on a Product detail page and applies a bulk Transfer to a target location
- **THEN** all selected items update to the target location and the UI refreshes immediately without a full page reload

#### Scenario: Displaying product default measurement
- **WHEN** a product has a volume, weight, or length measurement configured
- **THEN** the Product detail view metadata summary displays the formatted measurement (e.g., `67.63 fl oz`)

## ADDED Requirements

### Requirement: Collapsible optional measurement editor on product form
The Product create and edit form SHALL provide a tucked-away, expandable `Measurement (Optional)` section allowing users to set, adjust, or clear a product's unit type (`volume`, `weight`, `length`), numeric value, and unit without cluttering the default form layout.

#### Scenario: Editing a product's measurement
- **WHEN** a user opens the Product create or edit form, expands `Measurement (Optional)`, enters a measurement value and unit, and saves
- **THEN** the measurement is persisted on the product via the products API and displayed when the product is viewed or re-edited

#### Scenario: Clearing a product's measurement
- **WHEN** a user edits a product that has an existing measurement, sets the measurement type to `None` (or clears the value), and saves
- **THEN** the product's measurement fields are cleared on save

## MODIFIED Requirements

### Requirement: Products list, sorting, and quick search
The Products view SHALL display matching products with stock counts, the next-due item's location when in stock (instead of the product's default location), next due date, and shopping-list/overdue indicators, provide list sorting and filter controls, and expose a fast fuzzy search interface accessible from the sidebar, mobile dock, or keyboard shortcut.

#### Scenario: Quick fuzzy search navigates to product
- **WHEN** a user opens Search, types a partial product name, and selects a result
- **THEN** the application navigates directly to that product's detail view

#### Scenario: Inventory list displays next-due item location
- **WHEN** a user views the inventory list for a product whose next-due item is in `"Fridge"` while its default location is `"Pantry"`
- **THEN** the product card displays `"Fridge"` alongside the category instead of `"Pantry"`

### Requirement: Product detail view and bulk item management
The Product detail view SHALL display product metadata (showing the next-due item's location in the header instead of the default location), due-date rules, variants, and retail barcodes, provide header actions (toggle Shopping List, print Product label, Edit, Delete), and list individual `Item` records showing each item's full location and read-only attached variant once, with multi-select bulk variant adjustment alongside consume, open, transfer, due-date edit, and reprint actions.

#### Scenario: Bulk transfer of selected items
- **WHEN** a user selects multiple unconsumed items on a Product detail page and applies a bulk Transfer to a target location
- **THEN** all selected items update to the target location and the UI refreshes immediately without a full page reload

#### Scenario: Displaying and adjusting an item's variant on the Product detail page
- **WHEN** a user views an in-stock item on a Product detail page
- **THEN** item `#id` numbers are omitted, the item displays its attached variant first in larger neutral text followed by its full location path in smaller muted text with no `"Variant:"` or `"Location:"` prefixes (falling back to location on the primary line when no variant is attached), and selecting the item's checkbox allows changing or clearing its variant via the bulk action bar (`POST /api/items/bulk` with `action: "update_variant"`)

#### Scenario: Product header shows next-due item location instead of default location
- **WHEN** a user views a Product detail page whose soonest-due item is in `"Fridge"` (or whose first-entered item is in `"Fridge"` when no due dates exist)
- **THEN** the header subtitle displays the category and `"Fridge"` rather than the product's default location

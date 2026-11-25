# Spec Delta

## MODIFIED Requirements

### Requirement: Product detail view and bulk item management
The Product detail view SHALL display product metadata (default measurement when set, next-due item location in the header, `~X` rolling-average due days, and human-readable `Label Mode`), variants, and barcodes, provide header actions, and list individual `Item` records showing Variant first then Location (omitting `#id`) with single-item and bulk actions including bulk variant updates, where all interactive controls in the bulk item actions bar render at a uniform height.

#### Scenario: Bulk transfer of selected items
- **WHEN** a user selects multiple unconsumed items on a Product detail page and applies a bulk Transfer to a target location
- **THEN** all selected items update to the target location and the UI refreshes immediately without a full page reload

#### Scenario: Bulk item action controls render at uniform height
- **WHEN** a user selects one or more unconsumed items on a Product detail page so the bulk item actions bar is displayed
- **THEN** all visible interactive controls in the bulk actions bar (`Consume`, `Open`, `Reprint Labels`, the `Transfer to...` location selector, the bulk due-date input, the `Set variant...` selector, and any revealed confirmation buttons `Move`, `Set Due`, and `Set Variant`) render with the same uniform control height and aligned vertical centers

#### Scenario: Displaying product default measurement
- **WHEN** a product has a volume, weight, or length measurement configured
- **THEN** the Product detail view metadata summary displays the formatted measurement (e.g., `67.63 fl oz`)

#### Scenario: Displaying and adjusting an item's variant on the Product detail page
- **WHEN** a user views an in-stock item on a Product detail page
- **THEN** item `#id` numbers are omitted, the item displays its attached variant first in larger neutral text followed by its full location path in smaller muted text with no `"Variant:"` or `"Location:"` prefixes (falling back to location on the primary line when no variant is attached), and selecting the item's checkbox allows changing or clearing its variant via the bulk action bar (`POST /api/items/bulk` with `action: "update_variant"`)

#### Scenario: Product header shows next-due item location instead of default location
- **WHEN** a user views a Product detail page whose soonest-due item is in `"Fridge"` (or whose first-entered item is in `"Fridge"` when no due dates exist)
- **THEN** the header subtitle displays the category and `"Fridge"` rather than the product's default location

#### Scenario: Displaying rolling-average default due days as ~X
- **WHEN** a user views `/products/:id` for a product with `use_average_for_due_date = true` and `calculated_due_days = 14`
- **THEN** the `Default Due Days` metadata tile displays `~14` (and displays `—` when no qualifying purchase history exists yet)

#### Scenario: Displaying human-readable Label Mode on Product detail page
- **WHEN** a user views `/products/:id` for a product with `label_print_mode = "per_item"`
- **THEN** the `Label Mode` metadata tile displays `One label per item` instead of `per_item`

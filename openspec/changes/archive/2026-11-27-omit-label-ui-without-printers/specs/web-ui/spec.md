# Spec Delta

## ADDED Requirements

### Requirement: Conditional Label Print Mode field on product form
On `/products/new` and `/products/:id/edit`, the Product form SHALL display the `Label Print Mode` selector only when at least one printer is configured (`printers_enabled` is `true`). When no printers are configured, the form SHALL omit the `Label Print Mode` selector and submit the existing product's `label_print_mode` (or default `"per_item"` when creating a new product) unchanged.

#### Scenario: Product form omits Label Print Mode when no printers are configured
- **WHEN** `printers_enabled` is `false` and a user opens `/products/new` or `/products/:id/edit`
- **THEN** the `Label Print Mode` select field is not rendered and saving the form succeeds while preserving the product's stored or default `label_print_mode`

#### Scenario: Product form shows Label Print Mode when a printer is configured
- **WHEN** `printers_enabled` is `true` and a user opens `/products/new` or `/products/:id/edit`
- **THEN** the `Label Print Mode` select field (`One label per item`, `Single product label`, `No label`) is displayed and editable

## MODIFIED Requirements

### Requirement: Product detail view and bulk item management
The Product detail view SHALL display product metadata (default measurement when set, next-due item location in the header, `~X` rolling-average due days, and human-readable `Label Mode` when a printer is configured), variants, barcodes, and header actions, and SHALL list `Item` records (Variant then Location, omitting `#id`) with single-item and uniform-height bulk actions (omitting `Reprint Labels` when no printers are configured).

#### Scenario: Bulk transfer of selected items
- **WHEN** a user selects multiple unconsumed items on a Product detail page and applies a bulk Transfer to a target location
- **THEN** all selected items update to the target location and the UI refreshes immediately without a full page reload

#### Scenario: Bulk item action controls render at uniform height
- **WHEN** a user selects one or more unconsumed items on a Product detail page so the bulk item actions bar is displayed
- **THEN** all visible interactive controls in the bulk actions bar (`Consume`, `Open`, `Reprint Labels` when a printer is configured, the `Transfer to...` location selector, the bulk due-date input, the `Set variant...` selector, and any revealed confirmation buttons `Move`, `Set Due`, and `Set Variant`) render with the same uniform control height and aligned vertical centers

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
- **WHEN** `printers_enabled` is `true` and a user views `/products/:id` for a product with `label_print_mode = "per_item"`
- **THEN** the `Label Mode` metadata tile displays `One label per item` instead of `per_item`

#### Scenario: Omitting Label Mode tile and Reprint Labels action when no printers are configured
- **WHEN** `printers_enabled` is `false` and a user views `/products/:id` (and selects one or more items)
- **THEN** the `Label Mode` metadata tile is omitted from the metadata summary grid and the `Reprint Labels` button is omitted from the bulk item actions bar

### Requirement: Categories and locations management views
The web application SHALL provide views to create, edit, nest, and delete `Category` and `Location` trees, including renaming categories and locations, changing or clearing their parent via the hierarchical drill-down selector (excluding the edited node and its descendants from valid parent choices), toggling `is_freezer` on locations, and—when at least one printer is configured—triggering a location QR label print from the Locations list or Location detail view.

#### Scenario: Printing a location label from the UI
- **WHEN** `printers_enabled` is `true` and a user clicks Print Label on a Location detail view (or the print icon on a location row)
- **THEN** the application triggers a `location` label print and displays confirmation or any printer warning

#### Scenario: Omitting location print buttons when no printers are configured
- **WHEN** `printers_enabled` is `false` and a user views `/locations` or `/locations/:id`
- **THEN** the per-location `Print location label` icon buttons on `/locations` and the `Print Location Label` header button on `/locations/:id` are not rendered

#### Scenario: Editing a category inline on the Categories page
- **WHEN** a user clicks Edit on a category row on `/categories`, updates its name and/or changes its parent (including selecting `Top-level` to clear the parent), and saves
- **THEN** the application sends `PATCH /api/categories/{id}` with the updated `name` and `parent_id`, exits edit mode, and refreshes the category list, sidebar tree, and product views with the updated name and hierarchy

#### Scenario: Editing a location inline on the Locations page
- **WHEN** a user clicks Edit on a location row on `/locations`, updates its name, changes or clears its parent, and/or toggles the `Freezer` checkbox, and saves
- **THEN** the application sends `PATCH /api/locations/{id}` with the updated `name`, `parent_id`, and `is_freezer`, exits edit mode, and refreshes the location list, sidebar tree, and product views (showing or hiding the freezer indicator accordingly)

#### Scenario: Editing a location from the Location detail view
- **WHEN** a user clicks Edit on `/locations/:id`, updates the location's name, parent, or `Freezer` flag, and saves
- **THEN** the application sends `PATCH /api/locations/{id}` and updates the Location detail header (`hierarchy_name` and freezer status) as well as cached location and product queries

#### Scenario: Preventing circular parent selection in the edit parent picker
- **WHEN** a user edits a category or location that has children or grandchildren and opens its parent selector
- **THEN** the edited node itself and all of its descendants are excluded from the selectable parent options (both in drill-down browsing and cross-hierarchy search)

#### Scenario: Canceling an edit or displaying an API validation error
- **WHEN** a user clicks Cancel while editing a category or location
- **THEN** edit mode closes without sending a request and the row remains unchanged
- **AND** if saving fails with an API error, the edit form remains open and displays the error message inline

### Requirement: iOS and mobile form control layout and dark-mode styling
Form controls in multi-column responsive grids—including native `<input type="date">` and `<select>` controls—SHALL stay within their assigned column bounds on iOS, maintain consistent heights across adjacent fields, and declare dark `color-scheme` styling. In the Purchase form, `Label Mode` SHALL be shown only when `printers_enabled` is `true` and omitted otherwise without empty trailing columns.

#### Scenario: Due Date does not overlap Label Mode in the Purchase form on iOS
- **WHEN** `printers_enabled` is `true` and a user opens the `Scan & Action` Purchase form on an iOS mobile viewport (whether `Due Date` is empty or populated)
- **THEN** the `Due Date` input stays strictly within its left grid column (`min-width: 0`, `max-width: 100%`) without extending behind the adjacent `Label Mode` selector

#### Scenario: Adjacent Purchase form controls align vertically with consistent height
- **WHEN** a user views the `Quantity`, `Location`, `Due Date`, and (when `printers_enabled` is `true`) `Label Mode` grid in the `Scan & Action` Purchase form on iOS or desktop
- **THEN** all visible controls render with uniform height and aligned baselines without vertical collapse when `Due Date` is empty

#### Scenario: Purchase form omits Label Mode when no printers are configured
- **WHEN** `printers_enabled` is `false` and a user opens the `Scan & Action` Purchase form
- **THEN** the `Label Mode` selector is not rendered and the remaining `Quantity`, `Location`, and `Due Date` controls render cleanly without an empty trailing column on desktop

#### Scenario: Native form chrome respects dark theme contrast
- **WHEN** a user views native `<select>` or `<input type="date">` controls across the web application on iOS or desktop
- **THEN** the root document declares `color-scheme: dark` so native select chevrons, calendar icons, and picker sheets render with dark-theme contrast

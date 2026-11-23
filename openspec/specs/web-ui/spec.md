# web-ui Specification

## Purpose

Defines the responsive React web interface and installable PWA for browsing, searching, and managing household inventory, categories, locations, settings, printers, and label templates with a fresh, modern presentation built around the familiar sidebar-and-dock structure.

## Requirements

### Requirement: Responsive application shell and PWA support
The web application SHALL provide a responsive layout with a persistent navigation sidebar on desktop viewports, a slide-out navigation drawer and bottom action dock (`Inventory`, prominent `Scan / Action`, `Search`) on mobile viewports, safe-area inset handling, a custom minimal box brand logo in the sidebar and auth screens, and an installable PWA web manifest with matching favicon, Apple Touch Icon, and PWA icon assets.

#### Scenario: Mobile viewport displays bottom navigation dock
- **WHEN** a user opens the application on a mobile viewport
- **THEN** the sidebar collapses into a toggleable drawer and a bottom dock provides one-tap access to Inventory, Scan / Action, and Search

#### Scenario: Desktop viewport displays persistent sidebar
- **WHEN** a user opens the application on a desktop viewport
- **THEN** the navigation sidebar remains visible alongside the main content area and the mobile bottom dock is hidden

#### Scenario: Brand logo displayed in navigation and auth screens
- **WHEN** a user views the application sidebar or the login/setup screen
- **THEN** the custom minimal box brand logo is rendered alongside the `itemized` wordmark instead of the generic box icon

#### Scenario: Favicon and PWA icons configured for browser and home-screen install
- **WHEN** a browser loads the application or installs it as a PWA on desktop, iOS, or Android
- **THEN** `index.html` links the custom SVG/PNG favicons and `apple-touch-icon`, and `manifest.json` declares `192x192`, `512x512`, and maskable `512x512` PNG icons matching the custom brand logo

### Requirement: Sidebar status filters and hierarchy tree navigation
The navigation sidebar SHALL provide status views (`In Stock`, `Shopping List`, `Due Soon`, `Overdue`, `All Items`) with live item/product badge counts for actionable lists, alongside tabbed `Locations` and `Categories` hierarchy trees that filter the active view while preserving the selected status.

#### Scenario: Filtering a status view by location
- **WHEN** a user is viewing `In Stock` and selects a nested location in the sidebar `Locations` tab
- **THEN** the product list filters to in-stock products in that location (and its descendants) while keeping the `In Stock` status active

### Requirement: Products list, sorting, and quick search
The Products view SHALL display matching products with stock counts, the next-due item's location when in stock (instead of the product's default location), next due date, and shopping-list/overdue indicators, provide list sorting and filter controls, and expose a fast fuzzy search interface accessible from the sidebar, mobile dock, or keyboard shortcut.

#### Scenario: Quick fuzzy search navigates to product
- **WHEN** a user opens Search, types a partial product name, and selects a result
- **THEN** the application navigates directly to that product's detail view

#### Scenario: Inventory list displays next-due item location
- **WHEN** a user views the inventory list for a product whose next-due item is in `"Fridge"` while its default location is `"Pantry"`
- **THEN** the product card displays `"Fridge"` alongside the category instead of `"Pantry"`

### Requirement: Product detail view and bulk item management
The Product detail view SHALL display product metadata (default measurement when set, next-due item location in the header, `~X` rolling-average due days, and human-readable `Label Mode`), variants, and barcodes, provide header actions, and list individual `Item` records showing Variant first then Location (omitting `#id`) with single-item and bulk actions including bulk variant updates.

#### Scenario: Bulk transfer of selected items
- **WHEN** a user selects multiple unconsumed items on a Product detail page and applies a bulk Transfer to a target location
- **THEN** all selected items update to the target location and the UI refreshes immediately without a full page reload

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

### Requirement: Collapsible optional measurement editor on product form
The Product create and edit form SHALL provide a tucked-away, expandable `Measurement (Optional)` section allowing users to set, adjust, or clear a product's unit type (`volume`, `weight`, `length`), numeric value, and unit without cluttering the default form layout.

#### Scenario: Editing a product's measurement
- **WHEN** a user opens the Product create or edit form, expands `Measurement (Optional)`, enters a measurement value and unit, and saves
- **THEN** the measurement is persisted on the product via the products API and displayed when the product is viewed or re-edited

#### Scenario: Clearing a product's measurement
- **WHEN** a user edits a product that has an existing measurement, sets the measurement type to `None` (or clears the value), and saves
- **THEN** the product's measurement fields are cleared on save

### Requirement: Rolling-average due-days default and manual input lock
When creating a new product (in the Product form or the Purchase scanner workflow), the `Calculate due date from rolling average of recent purchases` option SHALL be checked by default, and whenever that option is checked, the manual `Due Days` input SHALL be disabled so the user cannot enter a manual value.

#### Scenario: Creating a new product defaults rolling average to checked and disables Due Days
- **WHEN** a user opens `/products/new` (or creates a new product in Purchase mode)
- **THEN** the rolling-average checkbox is checked by default and the `Due Days` input is disabled until the user unchecks the rolling-average option

#### Scenario: Unchecking rolling average re-enables manual Due Days entry
- **WHEN** a user unchecks the rolling-average checkbox on the Product form
- **THEN** the `Due Days` input becomes enabled and its entered value is saved as `default_due_days`

### Requirement: Categories and locations management views
The web application SHALL provide views to create, edit, nest, and delete `Category` and `Location` trees, including toggling `is_freezer` on locations and triggering a location QR label print from a location view.

#### Scenario: Printing a location label from the UI
- **WHEN** a user clicks Print Label on a Location detail view
- **THEN** the application triggers a `location` label print and displays confirmation or any printer warning

### Requirement: Keyboard shortcuts for desktop navigation
The web application SHALL support Gmail-style keyboard shortcuts when focus is not inside a text input: `g i` (In Stock), `g s` (Shopping List), `g d` (Due Soon), `g o` (Overdue), `g a` (All Items), `n` (New), `Esc` (close active modal or navigate back), and `?` (open keyboard shortcuts help dialog).

#### Scenario: Navigating with keyboard shortcut
- **WHEN** a user presses `g` followed by `s` outside of an input field
- **THEN** the application navigates to the `Shopping List` view

#### Scenario: Shortcuts suppressed while typing
- **WHEN** a user types `g` or `n` inside a search or form input
- **THEN** no navigation shortcut is triggered

### Requirement: Authentication and settings views
The web application SHALL provide dedicated views for first-run Admin setup, Login (displaying an OIDC sign-in button only when OIDC is configured), and Settings organized into Account, Household Users (Admin-only creation and password reset), Instance Configuration (`base_url`, `due_date_average_count`, OIDC, LLM), Printers (CRUD + test print), and ZPL Label Templates (editor with variable reference and reset-to-default).

#### Scenario: Non-admin user opens Settings
- **WHEN** a logged-in `member` opens Settings
- **THEN** account, printer, and template sections are accessible while Admin-only user management controls are hidden

# web-ui Specification

## Purpose

Defines the responsive React web interface and installable PWA for browsing, searching, and managing household inventory, categories, locations, settings, printers, and label templates with a fresh, modern presentation built around the familiar sidebar-and-dock structure.

## Requirements

### Requirement: Responsive application shell and PWA support
The web application SHALL provide a responsive layout with a persistent desktop sidebar, a solid non-blurred top header bar, a mobile drawer and bottom action dock (`Inventory`, `Scan / Action`, `Search`) that highlights the active navigation tab (`Inventory` or `Search`), top and bottom safe-area inset handling, automatic iOS input-focus zoom prevention without disabling manual pinch-to-zoom, the custom box brand logo in navigation and auth screens, and an installable PWA manifest with iOS full-screen home-screen meta tags, favicons, and Apple Touch Icon assets.

#### Scenario: Mobile viewport displays bottom navigation dock
- **WHEN** a user opens the application on a mobile viewport
- **THEN** the sidebar collapses into a toggleable drawer and a bottom dock provides one-tap access to Inventory, Scan / Action, and Search

#### Scenario: Active tab highlighted in mobile bottom navigation dock
- **WHEN** a user views the Inventory route (`/`) or the Search route (`/search`) on a mobile viewport
- **THEN** the corresponding bottom dock tab (`Inventory` for `/`, `Search` for `/search`) is visually highlighted using a distinct foreground color (without changing its background color) and `aria-current="page"`, while inactive tabs remain in their default muted foreground style

#### Scenario: Non-dock routes leave Inventory and Search tabs unhighlighted
- **WHEN** a user views a route outside Inventory and Search (such as `/settings`, `/categories`, or `/locations`) on a mobile viewport
- **THEN** neither the `Inventory` tab nor the `Search` tab in the mobile bottom dock is highlighted as active

#### Scenario: Top header renders without backdrop blur on iOS
- **WHEN** a user views any page of the application on iOS Safari or in standalone PWA mode
- **THEN** the top `<header>` renders with a solid opaque background (`bg-slate-900`) and no `backdrop-blur` (`backdrop-filter`) so the navigation menu icon and page title remain crisp without iOS top-edge blur artifacts

#### Scenario: Desktop viewport displays persistent sidebar
- **WHEN** a user opens the application on a desktop viewport
- **THEN** the navigation sidebar remains visible alongside the main content area and the mobile bottom dock is hidden

#### Scenario: Brand logo displayed in navigation and auth screens
- **WHEN** a user views the application sidebar or the login/setup screen
- **THEN** the custom minimal box brand logo is rendered alongside the `itemized` wordmark instead of the generic box icon

#### Scenario: Favicon and PWA icons configured for browser and home-screen install
- **WHEN** a browser loads the application or installs it as a PWA on desktop, iOS, or Android
- **THEN** `index.html` links the custom SVG/PNG favicons and `apple-touch-icon` (`/apple-touch-icon.png`), declares iOS/mobile standalone full-screen meta tags (`apple-mobile-web-app-capable`, `mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style`, `apple-mobile-web-app-title`, and `viewport-fit=cover`), and `manifest.json` declares `192x192`, `512x512`, and maskable `512x512` PNG icons matching the custom brand logo

#### Scenario: Focusing a text input on iOS does not trigger automatic page zoom
- **WHEN** a user on iOS focuses any `<input>`, `<textarea>`, or `<select>` control in the application (such as Quick Search, mobile Search, scanner input, auth fields, or product forms)
- **THEN** the control renders with a font size of at least `16px` so iOS Safari and standalone web apps do not automatically zoom the viewport or push navigation items off-screen, while preserving user pinch-to-zoom accessibility

#### Scenario: Standalone iOS full-screen layout respects top safe-area inset
- **WHEN** the application runs as an added-to-home-screen full-screen app on an iOS device with a status bar notch or Dynamic Island
- **THEN** the top header and slide-out navigation drawer include top safe-area inset padding (`env(safe-area-inset-top)`) and the shell uses dynamic viewport height (`100dvh`) so navigation controls remain unobstructed

#### Scenario: Standalone iOS full-screen layout respects bottom safe-area inset without compressing the bottom dock
- **WHEN** the application runs as an added-to-home-screen full-screen app on an iOS device with a home indicator (`env(safe-area-inset-bottom) > 0`)
- **THEN** the mobile bottom navigation dock expands its total height by `env(safe-area-inset-bottom)` (`calc(4rem + env(safe-area-inset-bottom))`) alongside `pb-[env(safe-area-inset-bottom)]` so its `Inventory`, `Scan / Action`, and `Search` buttons retain a full `4rem` height without vertical squishing or clipping, and the mobile navigation drawer footer includes bottom safe-area inset padding so account controls remain clear of the home indicator

### Requirement: Sidebar status filters and hierarchy tree navigation
The navigation sidebar SHALL provide status views (`In Stock`, `Shopping List`, `Due Soon`, `Overdue`, `All Items`) with live item/product badge counts for actionable lists, alongside tabbed `Locations` and `Categories` hierarchy trees that filter the active view while preserving the selected status.

#### Scenario: Filtering a status view by location
- **WHEN** a user is viewing `In Stock` and selects a nested location in the sidebar `Locations` tab
- **THEN** the product list filters to in-stock products in that location (and its descendants) while keeping the `In Stock` status active

### Requirement: Products list, sorting, and quick search
The Products view SHALL display matching products with stock counts, next-due item location when in stock, next due date, and shopping-list/overdue indicators in a compact desktop table with desktop-only selection checkboxes, bulk deletion, bulk product merging (when at least two products are selected), and bulk LLM name reclassification (when at least one product is selected and an LLM provider is configured), and a single-column mobile card layout; provide responsive filter, clear-filters, and create controls alongside desktop table column-header sorting across all six data columns (`Product`, `Category`, `Location`, `Stock`, `Next Due`, `Shopping List`) and a mobile-only sort dropdown (hidden on desktop viewports `>= 768px`) whose options appear in the exact order of the table columns; and expose fuzzy search via desktop Quick Search and a dedicated mobile `/search` page that preserves results when navigating back without exposing product merge or reclassification controls.

#### Scenario: Desktop viewports display inventory list pages as a compact table
- **WHEN** a user views an inventory list page (`In Stock`, `Shopping List`, `Due Soon`, `Overdue`, `All Items`, or a filtered category/location view) on a desktop viewport (`>= 768px`)
- **THEN** matching products are rendered in a semantic HTML table with a leading selection checkbox column (including a select-all header checkbox) followed by columns for Product, Category, Location, Stock, Next Due, and Shopping List (showing overdue, due-soon, and shopping-list badges where applicable) instead of a multi-column card grid, and activating a product link or non-checkbox portion of a row navigates to `/products/:id`

#### Scenario: Mobile viewports retain the single-column card view
- **WHEN** a user views an inventory list page on a mobile viewport (`< 768px`)
- **THEN** the desktop table and bulk actions bar are hidden and matching products render in the single-column card layout without selection checkboxes, displaying product name, stock count, category, next-due item location, due-date status, and shopping-list indicator

#### Scenario: Selecting products and bulk deleting from the desktop table
- **WHEN** a user on a desktop viewport selects one or more products using row checkboxes or the header select-all checkbox
- **THEN** toggling checkboxes updates the selection without navigating to `/products/:id`, a desktop-only floating bulk actions bar remains visible while scrolling showing the selected count and a `Delete` action, confirming deletion removes the selected products via `DELETE /api/products/{id}`, clears the selection, and refreshes the product list and sidebar counts (while canceling leaves products unchanged), and changing active filters, status, or search clears the current selection

#### Scenario: Merge bulk action appears only when at least two products are selected on desktop
- **WHEN** a user on a desktop viewport selects 1 product in the inventory list table
- **THEN** the floating bulk actions bar displays `Delete` and does not display `Merge`
- **AND** when the user selects a second product (2 or more selected), a `Merge` action appears alongside `Delete` in the floating bulk actions bar

#### Scenario: Merging selected products via destination selection modal
- **WHEN** a user on a desktop viewport selects two or more products, clicks `Merge` in the floating bulk actions bar, selects which product to keep as the destination in the Merge Products modal, and confirms the merge
- **THEN** the application sends `POST /api/products/merge` with the selected `target_product_id` and remaining `source_product_ids`, closes the modal, clears the selection, and refreshes the product list and sidebar counts (while canceling or dismissing the modal leaves products unchanged, and API errors are displayed inside the modal without losing the user's selection)

#### Scenario: Reclassify bulk action appears on desktop when LLM is configured
- **WHEN** a user on a desktop viewport selects one or more products in the inventory list table while an LLM provider is configured
- **THEN** a `Reclassify` action appears in the floating bulk actions bar alongside `Delete` (and `Merge` when 2+ products are selected)
- **AND** when no LLM provider is configured, the `Reclassify` action is hidden

#### Scenario: Reviewing, tweaking, excluding, and applying bulk reclassification with live merge preview
- **WHEN** a user clicks `Reclassify` on selected products
- **THEN** the Reclassify Products modal opens, fetches suggested standardized names from `POST /api/products/reclassify/suggest` (showing progress), and displays an editable table with per-row include/exclude checkboxes (defaulting unchanged names to unchecked), editable target-name inputs, and live action badges showing whether each included row will be renamed, merged into an unselected existing product, or merged with another included row sharing the same target name
- **AND** confirming sends only the included rows to `POST /api/products/reclassify/apply`, closes the modal, clears the selection, and refreshes the product list and sidebar counts

#### Scenario: Search views do not expose product merge controls
- **WHEN** a user uses desktop Quick Search or the mobile `/search` page
- **THEN** no selection checkboxes, product merge actions, or bulk reclassification actions are displayed

#### Scenario: Sorting inventory list via desktop table column headers
- **WHEN** a user views an inventory list page on a desktop viewport and clicks the `Product`, `Category`, `Location`, `Stock`, `Next Due`, or `Shopping List` column header button
- **THEN** the product list sort order updates to `name`, `category`, `location`, `stock`, `due_date`, or `shopping_list` respectively, fetches `/api/products` with that `sort` parameter, stays synchronized with the shared sort state, and indicates the active sort column

#### Scenario: Desktop viewports hide toolbar sort dropdown controls
- **WHEN** a user views an inventory list page on a desktop viewport (`>= 768px`) where the desktop table is displayed
- **THEN** both the full `Sort: ...` `<select>` dropdown and the compact icon-only sort dropdown button in the toolbar are hidden so users sort via the table column headers instead

#### Scenario: Compact single-row toolbar on narrow index viewports
- **WHEN** a user views an inventory index page (`In Stock`, `Shopping List`, `Due Soon`, `Overdue`, `All Items`, or a filtered category/location view) on a narrow mobile viewport (`< 768px`) where the filter input, full `Sort: ...` select, and `+ New Product` button do not fit on one line
- **THEN** the toolbar keeps the filter input, sort control, and create button on a single horizontal line by rendering an icon-only sort dropdown button (with accessible label `Sort products`) and an icon-only `+` link (with accessible label `New Product`) instead of the full-width text controls

#### Scenario: Changing sort order via the compact sort dropdown button
- **WHEN** a user activates the compact sort dropdown button on a mobile index page (`< 768px`)
- **THEN** a dropdown menu opens displaying the available sort options in the exact order of the desktop table columns (`Name`, `Category`, `Location`, `Stock Count`, `Soonest Due`, `Shopping List`) with the active option indicated, selecting an option updates the product list sort order and closes the menu, and clicking outside or pressing `Escape` closes the menu without changing the sort order

#### Scenario: Full-label toolbar controls on wider viewports
- **WHEN** a user views an inventory index page on a wider mobile viewport (`< 768px` with container width `>= 540px`)
- **THEN** the toolbar displays the filter input, full `Sort: ...` dropdown (with options in table column order), and `+ New Product` button with visible text labels on a single row
- **AND** on desktop viewports (`>= 768px`), the toolbar displays the filter input and `+ New Product` button without the toolbar sort dropdown

#### Scenario: Applying a filter on wider viewports shows inline Clear Filters without vertical layout shift
- **WHEN** a user applies an active filter (search text, category, or location) on an inventory index page at a wider viewport where the `Clear Filters` button fits inline in the primary toolbar row
- **THEN** the inline `Clear Filters` button appears in the primary toolbar row without adding extra vertical spacing below the toolbar or pushing the product list downward, while narrower viewports continue to render the wrapped `Clear Filters` button in a spaced secondary row below the primary toolbar row

#### Scenario: Quick fuzzy search navigates to product
- **WHEN** a user opens Quick Search from the desktop sidebar, types a partial product name, and selects a result
- **THEN** the application navigates directly to that product's detail view

#### Scenario: Mobile dock Search opens dedicated search page with identical behavior
- **WHEN** a user taps `Search` in the mobile bottom navigation dock
- **THEN** the application navigates to `/search` (instead of opening a modal dialog), displays an auto-focused search input with no divider or empty results space while the query is empty, queries `GET /api/products?status=all&q=...` as the user types, and displays a divider followed by matching products with their name and in-stock count identically to the Quick Search modal

#### Scenario: Mobile search page displays empty-results message when no products match
- **WHEN** a user enters a non-empty search query on `/search` that matches no products
- **THEN** the page displays the divider below the search input and renders `"No products match this search."`

#### Scenario: Navigating back from a product opened via mobile search restores prior search results
- **WHEN** a user enters a query on `/search`, selects a matching product to navigate to `/products/:id`, and then navigates back (either via browser/iOS back navigation or the Product Detail page's back button)
- **THEN** the application returns to `/search?q=<query>` with the prior search query populated and the prior matching search results displayed

#### Scenario: Inventory list displays next-due item location
- **WHEN** a user views the inventory list for a product whose next-due item is in `"Fridge"` while its default location is `"Pantry"`
- **THEN** the product entry (table row on desktop and card on mobile) displays `"Fridge"` instead of `"Pantry"`

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

### Requirement: Keyboard shortcuts for desktop navigation
The web application SHALL support Gmail-style keyboard shortcuts when focus is not inside a text input: `g i` (In Stock), `g s` (Shopping List), `g d` (Due Soon), `g o` (Overdue), `g a` (All Items), `n` (New), `Esc` (close active modal or navigate back), and `?` (open keyboard shortcuts help dialog).

#### Scenario: Navigating with keyboard shortcut
- **WHEN** a user presses `g` followed by `s` outside of an input field
- **THEN** the application navigates to the `Shopping List` view

#### Scenario: Shortcuts suppressed while typing
- **WHEN** a user types `g` or `n` inside a search or form input
- **THEN** no navigation shortcut is triggered

### Requirement: Authentication and settings views
The web application SHALL provide dedicated views for first-run Admin setup, Login (displaying an OIDC sign-in button when OIDC is configured, or automatically redirecting to `/api/auth/oidc/login` without rendering the local email/password form when Force OIDC is active on an initialized instance), and Settings organized into Account (accessible to all authenticated users) and Admin-only sections for Household Users (creation, role promotion/demotion between `member` and `admin`, deletion, and password reset), Instance Configuration (`base_url`, `due_date_average_count`, OIDC including Force OIDC, LLM), Printers (CRUD + test print), and ZPL Label Templates (editor with variable reference and reset-to-default). When an authenticated user clicks Logout, the web application SHALL revoke the session via `POST /api/auth/logout`, clear cached authenticated application data, reset the browser route to `/`, and immediately transition to the Login view (or trigger the Force OIDC redirect when Force OIDC is active) without requiring a manual page refresh.

#### Scenario: Non-admin user opens Settings
- **WHEN** a logged-in `member` opens Settings
- **THEN** only Account controls are displayed while Admin-only sections (Instance Configuration, Household Users, Label Printers, and ZPL Label Templates) are hidden and their admin API endpoints are not queried

#### Scenario: Admin changes another user's role in Settings
- **WHEN** a logged-in `admin` changes another user's role dropdown in Household Users from `member` to `admin` (or `admin` to `member`)
- **THEN** the application calls `PATCH /api/users/{id}` with the new role, refreshes the user list, and displays confirmation (while keeping the signed-in admin's own role non-editable)

#### Scenario: Admin configures OIDC options in Settings
- **WHEN** a logged-in `admin` opens Instance Configuration in Settings
- **THEN** both the "Auto-provision new household members on OIDC login" and "Force OIDC login" checkboxes under OIDC settings are disabled until both Issuer URL and Client ID are populated, and saving persists `oidc_auto_provision` and `oidc_force` via `PATCH /api/settings`

#### Scenario: Unauthenticated user lands on login screen with Force OIDC active
- **WHEN** an unauthenticated visitor opens the application on an initialized instance where `GET /api/auth/status` returns `oidc_enabled: true` and `oidc_force: true`
- **THEN** the login view does not render the local email/password form, automatically redirects the browser to `/api/auth/oidc/login`, and displays a redirecting message with a manual "Sign in with OIDC" fallback link

#### Scenario: Logging out returns the user to the login screen immediately
- **WHEN** an authenticated user (signed in via local credentials or optional OIDC) on any route (such as `/` or `/settings`) clicks the Logout button
- **THEN** the application calls `POST /api/auth/logout`, clears cached authenticated data, resets the URL path to `/`, and immediately renders the Login view without requiring a manual page refresh

#### Scenario: Logging out with Force OIDC active initiates OIDC redirect
- **WHEN** an authenticated user on an initialized instance with `oidc_enabled: true` and `oidc_force: true` clicks the Logout button
- **THEN** the application calls `POST /api/auth/logout`, clears cached authenticated data, resets the URL path to `/`, and immediately renders the unauthenticated Force OIDC view which redirects the browser to `/api/auth/oidc/login` without requiring a manual page refresh

### Requirement: Modal dialog backdrop dismissal
Every modal dialog in the web application (including the Scanner modal, Barcode Scan modal, Quick Search dialog, Keyboard Shortcuts help dialog, Merge Products dialog, and Reclassify Products dialog) SHALL close when the user clicks or taps the backdrop area outside the dialog panel, and SHALL remain open when the user interacts with elements inside the dialog panel or finishes a pointer drag on the backdrop that started inside the dialog panel.

#### Scenario: Clicking outside a modal dialog closes it
- **WHEN** a modal dialog (Scanner, Barcode Scan, Quick Search, Keyboard Shortcuts, Merge Products, or Reclassify Products) is open and the user clicks or taps the darkened backdrop outside the dialog panel
- **THEN** the modal dialog closes (triggering the same close behavior as its close button)

#### Scenario: Clicking inside a modal dialog does not close it
- **WHEN** a modal dialog is open and the user clicks or taps inside the dialog panel (including its header, body, form inputs, or non-closing controls)
- **THEN** the modal dialog remains open

#### Scenario: Dragging from inside a modal dialog onto the backdrop does not close it
- **WHEN** a modal dialog is open and the user presses the pointer inside the dialog panel (for example, to select text in an input) and releases it on the backdrop outside the dialog panel
- **THEN** the modal dialog remains open

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

### Requirement: Duplicate prevention and similar-product guidance on product form
On `/products/new` and `/products/:id/edit`, the Product Name field SHALL display a concise naming convention hint (e.g., `Item, Variety, Detail`) and, as the user types, SHALL query and display a live debounced list of similar existing products (excluding the product currently being edited) with links to view them, clearly highlighting any exact case-insensitive duplicate name and surfacing API `409 Conflict` duplicate errors inline.

#### Scenario: Typing a product name shows similar existing products on the Product form
- **WHEN** a user opens `/products/new` and types `"Apples, Fuji"` while `"Apples, Gala"` and `"Apples, Red"` exist
- **THEN** the form displays a `"Similar existing products"` list containing links to `"Apples, Gala"` and `"Apples, Red"`

#### Scenario: Exact duplicate name conflict is surfaced inline on Product form
- **WHEN** a user submits `/products/new` with a name that already exists case-insensitively and the API responds with HTTP 409 Conflict
- **THEN** the form displays an inline error message naming the existing product (with a link to it) without losing the entered form state

### Requirement: Brand name capitalization
The web application SHALL render the brand name in lowercase as `itemized` everywhere—including the browser `<title>`, PWA manifest (`name` and `short_name`), iOS `apple-mobile-web-app-title`, navigation wordmark, loading states, error messages, and UI copy—except when `Itemized` is the first word of a sentence.

#### Scenario: Metadata and PWA manifest use lowercase brand name
- **WHEN** a browser loads `index.html` or installs the application via `manifest.json`
- **THEN** `<title>`, `apple-mobile-web-app-title`, `manifest.json` `name`, and `manifest.json` `short_name` all use lowercase `itemized`

#### Scenario: In-app UI copy uses lowercase brand name mid-sentence
- **WHEN** a user views the loading screen, navigation wordmark, or camera HTTPS error message
- **THEN** `itemized` appears in lowercase everywhere mid-sentence or in labels, and `Itemized` is capitalized only when it starts a sentence

### Requirement: Sidebar footer menu alignment
The navigation sidebar footer (in both the desktop sidebar and mobile slide-out drawer) SHALL align the `Help` link and the account/settings link (`user.email`) on the same leading horizontal axis with matching padding, icon sizing, icon-to-label spacing, and interactive surface styling, while preserving email truncation, the right-aligned `Logout` button (outside demo mode), and mobile bottom safe-area inset padding.

#### Scenario: Help and account settings links align vertically in sidebar footer
- **WHEN** a user views the navigation sidebar footer on desktop or in the mobile slide-out drawer
- **THEN** the `Help` link and the account/settings (`user.email`) link share the same horizontal inset (`px-2`), vertical padding (`py-1.5`), rounded surface treatment (`rounded-lg`), and icon-to-label gap (`gap-2`) so their icons and text labels align on the same vertical axis

#### Scenario: Long email address truncates without misaligning icons or pushing Logout out of view
- **WHEN** a signed-in user has a long email address in a non-demo session
- **THEN** the settings icon remains fixed-size (`shrink-0`), the email text truncates cleanly with an ellipsis inside its flex container (`min-w-0 flex-1`), and the `Logout` button remains visible and right-aligned beside it

#### Scenario: Active route state highlighted for both Help and Settings links
- **WHEN** a user navigates to `/help` or `/settings`
- **THEN** the corresponding sidebar footer link displays the active highlight style while maintaining identical horizontal alignment with the other footer link

### Requirement: Conditional Label Print Mode field on product form
On `/products/new` and `/products/:id/edit`, the Product form SHALL display the `Label Print Mode` selector only when at least one printer is configured (`printers_enabled` is `true`). When no printers are configured, the form SHALL omit the `Label Print Mode` selector and submit the existing product's `label_print_mode` (or default `"per_item"` when creating a new product) unchanged.

#### Scenario: Product form omits Label Print Mode when no printers are configured
- **WHEN** `printers_enabled` is `false` and a user opens `/products/new` or `/products/:id/edit`
- **THEN** the `Label Print Mode` select field is not rendered and saving the form succeeds while preserving the product's stored or default `label_print_mode`

#### Scenario: Product form shows Label Print Mode when a printer is configured
- **WHEN** `printers_enabled` is `true` and a user opens `/products/new` or `/products/:id/edit`
- **THEN** the `Label Print Mode` select field (`One label per item`, `Single product label`, `No label`) is displayed and editable

### Requirement: Empty-catalog onboarding card on the home page
When the household catalog has zero total products (`status_counts.all === 0`) and no active filters on `/`, the web application SHALL render a Get Started onboarding card instead of `"No products match this view."`. The card SHALL provide a 1-click `Load Starter Setup` action (with completion state and links to `/locations` and `/categories`), direct `Scan / Action` and `+ New Product` controls, and a conditional HTTPS/camera notice when `!window.isSecureContext` on non-localhost hosts.

#### Scenario: Fresh instance displays Get Started card with 1-click starter setup
- **WHEN** a user lands on `/` on a fresh instance with zero products, zero categories, and zero locations
- **THEN** the page displays the Get Started onboarding card instead of `"No products match this view."`, with a `Load Starter Setup` button and links to `/locations` and `/categories`
- **AND** clicking `Load Starter Setup` calls `POST /api/onboarding/starter-taxonomy`, refreshes the sidebar category/location trees, and updates Step 1 to show a completed state

#### Scenario: Onboarding card triggers Scan / Action and New Product
- **WHEN** a user views the Get Started onboarding card on `/`
- **THEN** clicking `Scan / Action` opens the Scan / Action modal in Purchase mode, and clicking `+ New Product` navigates to `/products/new`

#### Scenario: Conditional non-HTTPS camera warning on onboarding card
- **WHEN** a user views the Get Started onboarding card over plain `http://` on a non-localhost hostname (`window.isSecureContext === false`)
- **THEN** the card displays a concise notice explaining that mobile browsers require HTTPS for camera barcode scanning, with a link to the HTTPS / reverse-proxy help documentation
- **AND** when `window.isSecureContext === true` (HTTPS or localhost), the warning is not shown

#### Scenario: Filtered empty view retains standard empty message
- **WHEN** the household has at least one product (or an active search/category/location filter returns zero matches)
- **THEN** the page displays `"No products match this view."` rather than the Get Started onboarding card

### Requirement: One-click starter taxonomy load on empty taxonomy pages
When `/categories` has zero categories or `/locations` has zero locations, the respective page SHALL display a 1-click button to load starter categories (`{ categories: true, locations: false }`) or starter locations (`{ categories: false, locations: true }`) via `POST /api/onboarding/starter-taxonomy` and refresh the list and sidebar tree.

#### Scenario: Loading starter categories from an empty Categories page
- **WHEN** a user visits `/categories` while zero categories exist and clicks `Load Starter Categories`
- **THEN** the application calls `POST /api/onboarding/starter-taxonomy` with `{ "categories": true, "locations": false }` and displays the newly created grocery-store category hierarchy

#### Scenario: Loading starter locations from an empty Locations page
- **WHEN** a user visits `/locations` while zero locations exist and clicks `Load Starter Locations`
- **THEN** the application calls `POST /api/onboarding/starter-taxonomy` with `{ "categories": false, "locations": true }` and displays the newly created household location hierarchy

### Requirement: Inline category and location creation in Purchase and Product forms
The Purchase workflow in the `Scan / Action` drawer (both new-product `Category` and `Default Location`, and purchase `Location`) and the New/Edit Product form (`/products/new`, `/products/:id/edit`) SHALL enable inline creation on their `HierarchySelect` category and location dropdowns so users can create a new category or location without leaving the workflow.

#### Scenario: Creating a category and location inline during Purchase scan workflow
- **WHEN** a user opens `Scan / Action` in Purchase mode to add a new product and creates a category or location inline from its dropdown
- **THEN** the new category or location is created via `POST /api/categories` or `POST /api/locations`, React Query `["categories"]` / `["locations"]` caches are invalidated, and the newly created node is selected in the Purchase form without losing other entered fields

#### Scenario: Creating a category or location inline on the Product form
- **WHEN** a user opens `/products/new` and creates a new category or default location inline from its dropdown
- **THEN** the new category or location is persisted, immediately selected on the form, and reflected in the navigation sidebar tree

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

### Requirement: Numeric input editing and normalization
Numeric form inputs across the web application SHALL allow users to clear the current value while editing without coercing an empty field to `0`, SHALL strip redundant leading zeros while preserving `"0"` and decimal values, SHALL safely evaluate simple arithmetic expressions (`+`, `-`, `*`, `/`, parentheses) to their numeric result on blur or submit, and SHALL restore required positive-integer fields to a valid value on blur while letting optional fields remain empty.

#### Scenario: Replacing a default quantity of 1 with 2 without snapping to 0
- **WHEN** a user focuses a required quantity field whose current value is `1` (such as Purchase `Quantity`, primary or second pack quantity, Inventory Audit scanned product quantity, or Variant barcode pack quantity), clears the field with Backspace, and types `2`
- **THEN** clearing the field displays an empty input instead of snapping to `0`, typing `2` results in `"2"` rather than `"02"`, and the form reflects and submits `2`

#### Scenario: Clearing a required positive-integer field and blurring restores a valid value
- **WHEN** a user clears a required positive-integer field (such as Purchase `Quantity` with minimum `1`, or `Due Date Rolling Average Count` with minimum `1`) and moves focus away without entering a new number
- **THEN** the field restores a valid value meeting its minimum constraint (such as `1` for quantities or the fallback default for rolling-average count) instead of remaining `0` or invalid

#### Scenario: Entering a value with redundant leading zeros normalizes cleanly
- **WHEN** a user types or pastes `"02"` into an integer numeric field (or `"00.5"` into a decimal measurement field)
- **THEN** redundant leading zeros are stripped so the field displays `"2"` (or `"0.5"` for decimals), while standalone `"0"` and `"0.5"` remain valid where allowed

#### Scenario: Evaluating a simple arithmetic expression in a measurement or quantity field
- **WHEN** a user enters `"500/5"` into a measurement value field (or `"2*6"` into a Purchase `Quantity` field) and blurs the field or submits the form
- **THEN** the expression resolves to `"100"` (or `"12"` for `2*6`), the displayed value updates to the resolved number on blur, and the form submits `100` (or `12`)

#### Scenario: Rounding and clamping evaluated arithmetic expressions
- **WHEN** a user enters an arithmetic expression whose result has decimals into an integer field (such as `"5/2"` in a quantity field) or a floating-point expression into a decimal field (such as `"0.1+0.2"` or `"100/3"` in a measurement field) and blurs
- **THEN** integer fields round to the nearest integer and clamp to their minimum constraint (e.g., `"5/2"` → `"3"`, `"1-5"` → `"1"` when `min` is `1`), and decimal fields clean floating-point noise (e.g., `"0.1+0.2"` → `"0.3"`, `"100/3"` → `"33.3333"`)

#### Scenario: Invalid expressions and division by zero fail safely
- **WHEN** a user enters an incomplete or invalid expression such as `"500/"`, `"abc"`, or `"500/0"` and moves focus away
- **THEN** no `NaN` or `Infinity` value is committed: required numeric fields restore their fallback or last valid value, and optional numeric fields restore their last valid value (or empty `""` if unset)

#### Scenario: Optional numeric fields remain clearable
- **WHEN** a user clears an optional numeric field (such as `Due Days`, `On Open (days)`, `On Freeze (days)`, `On Thaw (days)`, `Minimum Stock`, or a measurement value) and moves focus away
- **THEN** the field remains empty (`""`) and submits as unset/`null`

#### Scenario: Programmatic resets update displayed numeric value
- **WHEN** the application programmatically resets or populates a numeric field (such as Purchase `Quantity` resetting to `1` after submitting a purchase or scanning a new unknown barcode, or populating a scanned barcode's `default_quantity`)
- **THEN** the displayed input value updates immediately to match the new programmatic value

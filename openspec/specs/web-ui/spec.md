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
The Products view SHALL display matching products with stock counts, next-due item location when in stock, next due date, and shopping-list/overdue indicators; provide filter, sort, clear-filters, and create controls that collapse into a compact single-row icon sort dropdown button and `+` create button when full labels do not fit on one line, without shifting the product list downward when the inline `Clear Filters` control appears on wider viewports; and expose fuzzy search via desktop Quick Search and a dedicated mobile `/search` page that preserves results when navigating back.

#### Scenario: Compact single-row toolbar on narrow index viewports
- **WHEN** a user views an inventory index page (`In Stock`, `Shopping List`, `Due Soon`, `Overdue`, `All Items`, or a filtered category/location view) on a narrow viewport where the filter input, full `Sort: ...` select, and `+ New Product` button do not fit on one line
- **THEN** the toolbar keeps the filter input, sort control, and create button on a single horizontal line by rendering an icon-only sort dropdown button (with accessible label `Sort products`) and an icon-only `+` link (with accessible label `New Product`) instead of the full-width text controls

#### Scenario: Changing sort order via the compact sort dropdown button
- **WHEN** a user activates the compact sort dropdown button on a mobile index page
- **THEN** a dropdown menu opens displaying the available sort options (`Name`, `Soonest Due`, `Stock Count`) with the active option indicated, selecting an option updates the product list sort order and closes the menu, and clicking outside or pressing `Escape` closes the menu without changing the sort order

#### Scenario: Full-label toolbar controls on wider viewports
- **WHEN** a user views an inventory index page on a wider viewport where the filter input, full `Sort: ...` select, and `+ New Product` button fit on one line
- **THEN** the toolbar displays the filter input, full `Sort: ...` dropdown, and `+ New Product` button with visible text labels on a single row

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
The web application SHALL provide dedicated views for first-run Admin setup, Login (displaying an OIDC sign-in button when OIDC is configured, or automatically redirecting to `/api/auth/oidc/login` without rendering the local email/password form when Force OIDC is active on an initialized instance), and Settings organized into Account (accessible to all authenticated users) and Admin-only sections for Household Users (creation, role promotion/demotion between `member` and `admin`, deletion, and password reset), Instance Configuration (`base_url`, `due_date_average_count`, OIDC including Force OIDC, LLM), Printers (CRUD + test print), and ZPL Label Templates (editor with variable reference and reset-to-default).

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

### Requirement: Modal dialog backdrop dismissal
Every modal dialog in the web application (including the Scanner modal, Barcode Scan modal, Quick Search dialog, and Keyboard Shortcuts help dialog) SHALL close when the user clicks or taps the backdrop area outside the dialog panel, and SHALL remain open when the user interacts with elements inside the dialog panel or finishes a pointer drag on the backdrop that started inside the dialog panel.

#### Scenario: Clicking outside a modal dialog closes it
- **WHEN** a modal dialog (Scanner, Barcode Scan, Quick Search, or Keyboard Shortcuts) is open and the user clicks or taps the darkened backdrop outside the dialog panel
- **THEN** the modal dialog closes (triggering the same close behavior as its close button)

#### Scenario: Clicking inside a modal dialog does not close it
- **WHEN** a modal dialog is open and the user clicks or taps inside the dialog panel (including its header, body, form inputs, or non-closing controls)
- **THEN** the modal dialog remains open

#### Scenario: Dragging from inside a modal dialog onto the backdrop does not close it
- **WHEN** a modal dialog is open and the user presses the pointer inside the dialog panel (for example, to select text in an input) and releases it on the backdrop outside the dialog panel
- **THEN** the modal dialog remains open

### Requirement: iOS and mobile form control layout and dark-mode styling
Form controls in multi-column responsive grids—including native `<input type="date">` and `<select>` controls—SHALL stay within their assigned column bounds without overflowing adjacent controls on iOS, maintain consistent heights across adjacent fields, and declare dark `color-scheme` styling for legible native chrome.

#### Scenario: Due Date does not overlap Label Mode in the Purchase form on iOS
- **WHEN** a user opens the `Scan & Action` Purchase form on an iOS mobile viewport (whether `Due Date` is empty or populated)
- **THEN** the `Due Date` input stays strictly within its left grid column (`min-width: 0`, `max-width: 100%`) without extending behind the adjacent `Label Mode` selector

#### Scenario: Adjacent Purchase form controls align vertically with consistent height
- **WHEN** a user views the `Quantity`, `Location`, `Due Date`, and `Label Mode` grid in the `Scan & Action` Purchase form on iOS or desktop
- **THEN** all four controls render with uniform height and aligned baselines without vertical collapse when `Due Date` is empty

#### Scenario: Native form chrome respects dark theme contrast
- **WHEN** a user views native `<select>` or `<input type="date">` controls across the web application on iOS or desktop
- **THEN** the root document declares `color-scheme: dark` so native select chevrons, calendar icons, and picker sheets render with dark-theme contrast

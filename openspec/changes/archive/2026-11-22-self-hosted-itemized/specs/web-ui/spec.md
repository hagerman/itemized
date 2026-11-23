# Spec Delta

## Purpose

Defines the responsive React web interface and installable PWA for browsing, searching, and managing household inventory, categories, locations, settings, printers, and label templates with a fresh, modern presentation built around the familiar sidebar-and-dock structure.

## ADDED Requirements

### Requirement: Responsive application shell and PWA support
The web application SHALL provide a responsive layout with a persistent navigation sidebar on desktop viewports, a slide-out navigation drawer and bottom action dock (`Inventory`, prominent `Scan / Action`, `Search`) on mobile viewports, safe-area inset handling, and an installable PWA web manifest.

#### Scenario: Mobile viewport displays bottom navigation dock
- **WHEN** a user opens the application on a mobile viewport
- **THEN** the sidebar collapses into a toggleable drawer and a bottom dock provides one-tap access to Inventory, Scan / Action, and Search

#### Scenario: Desktop viewport displays persistent sidebar
- **WHEN** a user opens the application on a desktop viewport
- **THEN** the navigation sidebar remains visible alongside the main content area and the mobile bottom dock is hidden

### Requirement: Sidebar status filters and hierarchy tree navigation
The navigation sidebar SHALL provide status views (`In Stock`, `Shopping List`, `Due Soon`, `Overdue`, `All Items`) with live item/product badge counts for actionable lists, alongside tabbed `Locations` and `Categories` hierarchy trees that filter the active view while preserving the selected status.

#### Scenario: Filtering a status view by location
- **WHEN** a user is viewing `In Stock` and selects a nested location in the sidebar `Locations` tab
- **THEN** the product list filters to in-stock products in that location (and its descendants) while keeping the `In Stock` status active

### Requirement: Products list, sorting, and quick search
The Products view SHALL display matching products with stock counts, next due date, and shopping-list/overdue indicators, provide list sorting and filter controls, and expose a fast fuzzy search interface accessible from the sidebar, mobile dock, or keyboard shortcut.

#### Scenario: Quick fuzzy search navigates to product
- **WHEN** a user opens Search, types a partial product name, and selects a result
- **THEN** the application navigates directly to that product's detail view

### Requirement: Product detail view and bulk item management
The Product detail view SHALL display product metadata, due-date rules, variants, and associated retail barcodes, provide header actions (toggle Shopping List, print Product label, Edit, Delete), and list individual `Item` records with both single-item and multi-select bulk actions (consume, open, transfer, edit due date, reprint labels).

#### Scenario: Bulk transfer of selected items
- **WHEN** a user selects multiple unconsumed items on a Product detail page and applies a bulk Transfer to a target location
- **THEN** all selected items update to the target location and the UI refreshes immediately without a full page reload

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

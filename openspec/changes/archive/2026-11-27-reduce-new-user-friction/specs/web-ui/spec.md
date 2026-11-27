# Spec Delta

## ADDED Requirements

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

# Spec Delta

## MODIFIED Requirements

### Requirement: Categories and locations management views
The web application SHALL provide views to create, edit, nest, and delete `Category` and `Location` trees, including renaming categories and locations, changing or clearing their parent via the hierarchical drill-down selector (excluding the edited node and its descendants from valid parent choices), toggling `is_freezer` on locations, and triggering a location QR label print from a location view.

#### Scenario: Printing a location label from the UI
- **WHEN** a user clicks Print Label on a Location detail view
- **THEN** the application triggers a `location` label print and displays confirmation or any printer warning

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

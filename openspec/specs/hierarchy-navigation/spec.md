# hierarchy-navigation Specification

## Purpose

Defines how hierarchical categories and locations are displayed, filtered, searched, and selected across the sidebar navigation, taxonomy management lists, and form/workflow dropdowns.

## Requirements

### Requirement: Indented hierarchy rendering in sidebar and taxonomy lists
The web application SHALL render nested categories and locations in the left navigation sidebar and taxonomy management lists in parent-before-children tree order, displaying each node's short `name` indented according to its tree depth rather than concatenated `"Parent > Child > Grandchild"` paths.

#### Scenario: Nested locations display with visual indentation
- **WHEN** `Kitchen` contains child `Fridge` which contains grandchild `Top Shelf`
- **THEN** the sidebar Locations list renders `Kitchen` at depth 0, `Fridge` indented beneath it at depth 1, and `Top Shelf` further indented at depth 2 using only each node's short name

### Requirement: Toggle-to-clear active sidebar taxonomy filter
Clicking an already-selected category or location in the left navigation sidebar SHALL unselect it and remove the corresponding `category_id` or `location_id` filter while preserving the active inventory status view.

#### Scenario: Clicking a selected location clears the filter
- **WHEN** the user is viewing `In Stock` filtered by `Fridge` and clicks `Fridge` again in the sidebar
- **THEN** the `location_id` filter is removed and the view returns to all `In Stock` products

#### Scenario: Clicking a selected category clears the filter
- **WHEN** the user is viewing `Shopping List` filtered by `Dairy` and clicks `Dairy` again in the sidebar
- **THEN** the `category_id` filter is removed and the view returns to all `Shopping List` products

### Requirement: Hierarchical drill-down dropdown
All category and location dropdown selectors across product forms, bulk item actions, scanner workflows, and taxonomy parent pickers SHALL use a hierarchical drill-down selector that opens to top-level nodes, selects leaf nodes on click, and drills into parent nodes on click.

#### Scenario: Selecting a leaf node from top level
- **WHEN** the user opens a location dropdown and clicks a top-level location with no children
- **THEN** that location is selected immediately and the dropdown closes

#### Scenario: Drilling into a parent node and selecting it or a child
- **WHEN** the user clicks a node that has children
- **THEN** the dropdown drills into that node, showing an icon-only back arrow button (without the visible word "Back", with an accessible `aria-label`), a top `Select "<Node Name>"` action to select that parent node itself, and a grouped list below showing its direct children
- **AND** clicking `Select "<Node Name>"` selects the parent node and closes the dropdown
- **AND** clicking a child with children drills deeper, while clicking a leaf child selects it and closes the dropdown

### Requirement: Cross-hierarchy search at all drill levels
The hierarchical drill-down dropdown SHALL display a search input at the top of the panel at both the root level and every drilled-in level. Entering a search term SHALL search across all nodes in the entire hierarchy regardless of the current drill level, render matching nodes as full `"Parent > Child > Grandchild"` paths, and select the clicked match immediately.

#### Scenario: Searching while drilled into a branch finds matches across all hierarchies
- **WHEN** the user has drilled into `Kitchen` and types `"shelf"` into the dropdown search bar
- **THEN** the dropdown displays all matching nodes across the entire hierarchy (including nodes outside `Kitchen`) formatted as `"Parent > Child > Grandchild"` (e.g., `Garage > Rack > Top Shelf`)
- **AND** clicking any search result selects that node, clears the search, and closes the dropdown

#### Scenario: Clearing search restores the current drill level
- **WHEN** the user clears the search input
- **THEN** the dropdown returns to showing the current drill-down level's options

### Requirement: Optional inline node creation in hierarchical drill-down selector
When enabled by its host form or workflow, the hierarchical drill-down selector SHALL offer `+ Create "<name>"` when a typed name does not exactly match a sibling under the current parent (case-insensitively). When freezer creation is enabled, it SHALL also offer `+ Create Freezer "<name>"` instead of a freezer checkbox. Activating either action SHALL create the node (`is_freezer: false` or `true`), refresh the hierarchy, select it, and close the dropdown.

#### Scenario: Creating a new category inline from an empty or non-matching picker
- **WHEN** a user opens an inline-create-enabled category selector, types `"Spices"` (which does not exist at the current level), and activates `+ Create "Spices"`
- **THEN** the selector invokes the create callback with name `"Spices"` and the current drill-down `parent_id` (`null` at root), selects the newly created category, clears the search input, and closes the dropdown
- **AND** no freezer create button is shown

#### Scenario: Creating a nested location inline while drilled into a parent
- **WHEN** a user drills into `Kitchen` inside an inline-create-enabled location selector, types `"Spice Rack"`, and activates `+ Create "Spice Rack"`
- **THEN** the selector creates `"Spice Rack"` with `parent_id` set to `Kitchen`'s ID and `is_freezer: false`, selects `"Kitchen > Spice Rack"`, and closes the dropdown

#### Scenario: Creating a freezer location inline
- **WHEN** a user opens an inline-create-enabled location selector, types `"Deep Freeze"`, and activates `+ Create Freezer "Deep Freeze"`
- **THEN** the selector creates `"Deep Freeze"` with `is_freezer: true` and selects it immediately
- **AND** no separate `Freezer` checkbox is rendered in the dropdown footer

#### Scenario: Inline creation failure keeps dropdown open and shows error
- **WHEN** inline node creation fails with an API error
- **THEN** the dropdown remains open, displays the error message inline, and preserves the user's typed name so they can retry or edit

#### Scenario: Selectors without inline creation enabled remain unchanged
- **WHEN** a user opens a hierarchical drill-down selector that does not enable inline creation (such as a parent picker while editing a category or location)
- **THEN** no `+ Create` action is rendered when search yields no matches

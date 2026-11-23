# Spec Delta

## Purpose

Defines how hierarchical categories and locations are displayed, filtered, searched, and selected across the sidebar navigation, taxonomy management lists, and form/workflow dropdowns.

## ADDED Requirements

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

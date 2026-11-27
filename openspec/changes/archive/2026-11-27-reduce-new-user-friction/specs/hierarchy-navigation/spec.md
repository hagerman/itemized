# Spec Delta

## ADDED Requirements

### Requirement: Optional inline node creation in hierarchical drill-down selector
When enabled by its host form or workflow, the hierarchical drill-down selector SHALL offer a `+ Create "<name>"` action whenever the user types a non-empty name that does not exactly match an existing sibling under the current drill-down parent (case-insensitively). Activating it SHALL create the node under the current parent (with an optional `Freezer` toggle for locations), refresh the hierarchy, select the new node, and close the dropdown.

#### Scenario: Creating a new category inline from an empty or non-matching picker
- **WHEN** a user opens an inline-create-enabled category selector, types `"Spices"` (which does not exist at the current level), and activates `+ Create "Spices"`
- **THEN** the selector invokes the create callback with name `"Spices"` and the current drill-down `parent_id` (`null` at root), selects the newly created category, clears the search input, and closes the dropdown

#### Scenario: Creating a nested location inline while drilled into a parent
- **WHEN** a user drills into `Kitchen` inside an inline-create-enabled location selector, types `"Spice Rack"`, and activates `+ Create "Spice Rack"`
- **THEN** the selector creates `"Spice Rack"` with `parent_id` set to `Kitchen`'s ID (and `is_freezer` reflecting the inline Freezer toggle), selects `"Kitchen > Spice Rack"`, and closes the dropdown

#### Scenario: Creating a freezer location inline
- **WHEN** a user opens an inline-create-enabled location selector, types `"Deep Freeze"`, enables the inline `Freezer` toggle, and activates `+ Create "Deep Freeze"`
- **THEN** the selector creates `"Deep Freeze"` with `is_freezer: true` and selects it immediately

#### Scenario: Inline creation failure keeps dropdown open and shows error
- **WHEN** inline node creation fails with an API error
- **THEN** the dropdown remains open, displays the error message inline, and preserves the user's typed name so they can retry or edit

#### Scenario: Selectors without inline creation enabled remain unchanged
- **WHEN** a user opens a hierarchical drill-down selector that does not enable inline creation (such as a parent picker while editing a category or location)
- **THEN** no `+ Create` action is rendered when search yields no matches

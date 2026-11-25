# Spec Delta

## MODIFIED Requirements

### Requirement: Hierarchical categories and locations
The system SHALL support nested `Category` and `Location` trees via optional `parent_id` references and an `is_freezer` flag on each `Location`. Updating a `Category` or `Location` SHALL support renaming, changing or clearing `parent_id`, and toggling `is_freezer` (for locations), while rejecting blank names and self- or descendant-parent cycles with HTTP 422 Unprocessable Entity.

#### Scenario: Location hierarchy display and freezer flag
- **WHEN** a location has a parent location and `is_freezer` set to true
- **THEN** the system preserves the hierarchy path and exposes `is_freezer` for transfer due-date calculations

#### Scenario: Updating a category name and parent
- **WHEN** a client sends `PATCH /api/categories/{id}` with a new non-empty `name` and a valid `parent_id` (or `null` for top-level)
- **THEN** the system persists the updated `name` and `parent_id` and returns HTTP 200 with the updated category including its recomputed `hierarchy_name`

#### Scenario: Updating a location name, parent, and freezer flag
- **WHEN** a client sends `PATCH /api/locations/{id}` with a new non-empty `name`, a valid `parent_id` (or `null` for top-level), and an updated `is_freezer` boolean
- **THEN** the system persists all three fields and returns HTTP 200 with the updated location including its recomputed `hierarchy_name` and `is_freezer` value

#### Scenario: Rejecting blank name on category or location update
- **WHEN** a client sends `PATCH /api/categories/{id}` or `PATCH /api/locations/{id}` with an empty or whitespace-only `name`
- **THEN** the system rejects the request with HTTP 422 Unprocessable Entity and leaves the stored record unchanged

#### Scenario: Rejecting self-parenting or descendant cycle on update
- **WHEN** `Kitchen` contains child `Fridge` which contains grandchild `Top Shelf`, and a client sends `PATCH /api/locations/{kitchen_id}` with `parent_id` set to `kitchen_id`, `fridge_id`, or `top_shelf_id` (or performs the equivalent cycle update on categories)
- **THEN** the system rejects the request with HTTP 422 Unprocessable Entity and leaves the hierarchy unchanged

# Proposal

## Why

Users can currently create and delete categories and locations in the web UI, but have no way to edit existing taxonomy elements after creation—renaming a category or location, reparenting it in the hierarchy (or promoting it to top-level), or toggling a location's `is_freezer` flag requires deleting and recreating entries, which is blocked whenever products reference them. Additionally, the existing backend `PATCH /api/categories/{id}` and `PATCH /api/locations/{id}` endpoints do not reject empty names or descendant cycles when reparenting.

## What Changes

- **Web UI (`CategoriesPage`, `LocationsPage`, `LocationDetailPage`)**:
  - Add edit controls to every category row on `/categories` allowing users to rename the category and change or clear its parent (using `HierarchySelect` with the edited category and its descendants excluded to prevent cycles), with Save/Cancel actions and inline error feedback.
  - Add edit controls to every location row on `/locations` and on the `/locations/:id` detail view allowing users to rename the location, change or clear its parent (excluding self and descendants), and toggle its `is_freezer` flag, with Save/Cancel actions and inline error feedback.
  - Invalidate relevant React Query caches (`categories`, `locations`, `location`, `products`, `product`) on save so the taxonomy list, sidebar tree, detail header, and product hierarchy paths update immediately.
- **Backend API (`PATCH /api/categories/{id}`, `PATCH /api/locations/{id}`)**:
  - Reject empty or whitespace-only `name` values with HTTP 422 Unprocessable Entity (matching create behavior).
  - Reject reparenting a category or location under itself or any of its own descendants (preventing multi-node hierarchy cycles) with HTTP 422 Unprocessable Entity.

## Capabilities

### New Capabilities
<!-- None: this change extends existing taxonomy catalog and web UI capabilities. -->

### Modified Capabilities
- `inventory-catalog`: Add explicit update validation requirements for editing `Category` and `Location` records (non-empty trimmed name, cycle prevention across descendants when changing `parent_id`, clearing `parent_id` to top-level, and toggling `is_freezer` on locations).
- `web-ui`: Specify interactive editing workflows for categories (`/categories`) and locations (`/locations` and `/locations/:id`), including renaming, reparenting via `HierarchySelect` with self/descendant exclusion, toggling `is_freezer`, and immediate UI refresh.

## Impact

- **Backend**: `internal/api/catalog.go` (`handleUpdateCategory`, `handleUpdateLocation`), `internal/api/api_test.go` (unit/integration tests for taxonomy updates and validation).
- **Frontend**: `web/src/pages/TaxonomyPages.tsx`, `web/src/components/HierarchySelect.tsx` (optional helper to collect descendant IDs if shared, or local helper), new frontend test file `web/src/pages/TaxonomyPages.test.tsx`.
- **APIs**: Existing `PATCH /api/categories/{id}` and `PATCH /api/locations/{id}` endpoints (non-breaking validation hardening; valid payloads behave identically).
- **Database**: No schema or migration changes required.

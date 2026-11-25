# Design

## Context

See `proposal.md` for motivation and scope.

Currently:
- **Backend** (`internal/api/catalog.go`): `PATCH /api/categories/{id}` (`handleUpdateCategory`) and `PATCH /api/locations/{id}` (`handleUpdateLocation`) already exist and are routed in `internal/api/server.go`. Both accept `name`, `parent_id`, and (for locations) `is_freezer`, and return the updated record with recomputed `hierarchy_name`. However, neither trims/validates non-empty `name`, and both only guard against direct self-parenting (`*req.ParentID == id`) without checking for multi-hop descendant cycles, even though `collectDescendantCategoryIDs` and `collectDescendantLocationIDs` already exist in `catalog.go`.
- **Frontend** (`web/src/pages/TaxonomyPages.tsx`): `CategoriesPage` and `LocationsPage` render a create form above an indented hierarchy list (`flattenHierarchyTree(buildHierarchyTree(...))`), with only Delete (and Print Label for locations) actions per row. `LocationDetailPage` renders the location header, Print Location Label button, and stored items list. `HierarchySelect` (`web/src/components/HierarchySelect.tsx`) is already used for the create forms' parent pickers.

## Goals / Non-Goals

**Goals:**
- Provide fast, consistent inline editing on `CategoriesPage`, `LocationsPage`, and `LocationDetailPage` for renaming, reparenting (including clearing to `Top-level`), and toggling `is_freezer` (locations).
- Prevent hierarchy cycles both proactively in the UI parent picker and authoritatively on the backend API.
- Keep all dependent UI views (taxonomy list, sidebar hierarchy tree, location detail header, product list/detail hierarchy names) synchronized via React Query cache invalidation.

**Non-Goals:**
- Drag-and-drop tree reordering.
- Bulk editing or merging taxonomy elements.
- Changing item due dates retroactively when a location's `is_freezer` flag is toggled (freezer due-date calculation remains a transfer-time event as defined in `inventory-catalog`).

## Decisions

### 1. Inline row edit form on `CategoriesPage` and `LocationsPage` (and inline header edit form on `LocationDetailPage`)
- **Decision**: Clicking an edit icon button (`Pencil`, accessible label `Edit <name>` or `Edit category` / `Edit location`) transforms that row into a compact inline edit form containing the name `<input>`, a `HierarchySelect` parent picker (`allowEmpty`, `emptyLabel="Top-level"`), a `Freezer` checkbox (for locations), and `Save` / `Cancel` controls, plus an inline error banner if the `PATCH` fails. Only one row is edited at a time (`editingId: number | null`). On `LocationDetailPage`, an `Edit` button next to `Print Location Label` toggles an inline edit panel above the items list (fetching `/api/locations` for the parent picker).
- **Rationale**: Matches the existing single-page create-and-list ergonomics in `TaxonomyPages.tsx`, avoids adding new routes or modal boilerplate, and works cleanly on both desktop and mobile viewports (using `flex-wrap` like the create form).
- **Alternatives considered**:
  - *Modal dialog for editing*: Heavier interaction and unnecessary given only 2–3 fields per taxonomy element.
  - *Separate `/categories/:id/edit` and `/locations/:id/edit` routes*: Breaks list context when renaming or reorganizing multiple taxonomy nodes in sequence.

### 2. Excluding self and descendants from `HierarchySelect` parent options
- **Decision**: Add a small pure helper `collectDescendantIds<T extends HierarchyItem>(rootId: number, items: T[]): Set<number>` in `web/src/components/HierarchySelect.tsx` (returning `rootId` plus all transitive descendants). When rendering the edit form's `HierarchySelect`, pass `items.filter((x) => !excluded.has(x.id))`.
- **Rationale**: Because `HierarchySelect` builds both its drill-down tree and its cross-hierarchy search results directly from its `items` prop, filtering the `items` array automatically prevents selecting self or any descendant in both browsing and search without complicating `HierarchySelect`'s internal state. Note: if a node's descendants are removed, no remaining node has a removed node as its parent, so the remaining tree structure is completely preserved.
- **Alternatives considered**:
  - *Adding a `disabledIds` prop to `HierarchySelect`*: Would still require special handling for drilling into disabled parents vs. search results, with no UX benefit since descendants can never be valid parents.

### 3. Backend cycle and name validation in `handleUpdateCategory` / `handleUpdateLocation`
- **Decision**:
  - Trim `req.Name` and return HTTP 422 (`"name is required"`) if empty.
  - Before executing the `UPDATE`, when `req.ParentID != nil`:
    - If `*req.ParentID == id`, return HTTP 422 (`"category cannot be its own parent"` / `"location cannot be its own parent"`).
    - Load existing categories/locations via `listAllCategories` / `listAllLocations`, compute `collectDescendantCategoryIDs(id, list)` / `collectDescendantLocationIDs(id, list)`, and if `descendants[*req.ParentID]` is true, return HTTP 422 (`"category cannot be moved under its own descendant"` / `"location cannot be moved under its own descendant"`).
- **Rationale**: Reuses the existing `collectDescendant*IDs` helpers in `internal/api/catalog.go`, guarantees tree acyclicity regardless of client behavior, and keeps `buildCategoryPath`/`buildLocationPath` and descendant filtering sound.
- **Alternatives considered**:
  - *Relying only on UI filtering*: Direct API clients or stale tabs could still create cycles in SQLite.

### 4. React Query cache invalidation on taxonomy update
- **Decision**: After a successful `PATCH`, invalidate:
  - Categories: `["categories"]`, `["products"]`, `["product"]`
  - Locations: `["locations"]`, `["location", String(id)]`, `["products"]`, `["product"]`
- **Rationale**: Sidebar trees read `["categories"]` and `["locations"]`, product lists/details embed `category_name`, `default_location_name`, and `next_location_name` computed from taxonomy hierarchy paths, and `LocationDetailPage` reads `["location", id]`.

## Risks / Trade-offs

- **[Risk] Concurrent edits creating a cycle between two requests** → Single-household SQLite deployment has minimal concurrency, and the check-then-update happens immediately before the SQLite `UPDATE`. If desired, it could be wrapped in a transaction, though standard request-level check matches existing handlers in `catalog.go`.
- **[Risk] Toggling `is_freezer` on a location with existing items** → Existing items keep their current `due_on_date`; only future transfers into/out of the location use the updated `is_freezer` flag. This is consistent with the existing `inventory-catalog` spec.

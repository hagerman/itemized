# Design

## Context

See [proposal.md](proposal.md) for motivation. The Go API endpoints (`GET /api/categories`, `GET /api/locations`) already return flat arrays where every record includes `id`, `name`, `parent_id`, and `hierarchy_name` (`"Parent > Child > Grandchild"`). All changes are purely client-side in `web/src/`.

## Goals / Non-Goals

**Goals:**
- Shared, cycle-safe tree-building utility (`buildHierarchyTree`, `flattenHierarchyTree`) used by both the sidebar/taxonomy lists and the drill-down dropdown.
- Single reusable `<HierarchySelect />` component replacing every `<select>` for categories and locations across the SPA.
- Fast client-side cross-hierarchy search available at every drill level of `<HierarchySelect />`.
- Zero backend or schema changes.

**Non-Goals:**
- Server-side search pagination for categories/locations (household taxonomy lists are small enough for instant in-memory filtering).
- Drag-and-drop reparenting of categories/locations.

## Decisions

### 1. Tree Construction & Indentation
- Build a `Map<number | null, T[]>` grouping nodes by `parent_id` (treating dangling or cyclic `parent_id`s as root nodes via a `visited` set), sorting siblings case-insensitively by `name`.
- Flatten via depth-first traversal into `{ item, depth, hasChildren }` so `Layout.tsx` and `TaxonomyPages.tsx` render each node's short `item.name` with `paddingLeft: depth * 14 + 10` (sidebar) or `depth * 18 + 16` (management lists), keeping `title={item.hierarchy_name}` as a hover tooltip.

### 2. Sidebar Filter Toggle
- In `Layout.tsx`, compute `isSelected = activeLocId === String(l.id)` (and `activeCatId === String(c.id)`).
- Pass `location_id: isSelected ? null : String(l.id)` (or `category_id: isSelected ? null : String(c.id)`) to `buildFilterUrl`, which preserves the current `status` query parameter while removing the taxonomy parameter when toggled off.

### 3. Hierarchical Drill-Down `<HierarchySelect />` with Persistent Search
- **State**: `open: boolean`, `drillStack: number[]`, `query: string`.
- **Top bar (always rendered while open)**: Search input (`placeholder="Search..."`, clear button when non-empty) positioned above both the root view and every drilled-in view.
- **Search mode (`query.trim() !== ""`)**:
  - Case-insensitive substring match against `item.hierarchy_name || item.name` across the entire `items` array (ignoring `drillStack`).
  - Render matches sorted by `hierarchy_name` as `"Parent > Child > Grandchild"`; clicking any match immediately calls `onChange(item.id)` and closes/resets the popover.
- **Drill-down mode (`query.trim() === ""`)**:
  - Root (`drillStack.length === 0`): optional `allowEmpty` top row (e.g., `"Top-level"` or `"Transfer to..."`), then top-level nodes (`parent_id === null`). Nodes with children display a right chevron; clicking a parent pushes its `id` onto `drillStack`, while clicking a leaf selects it and closes.
  - Drilled-in (`currentParent` = top of `drillStack`):
    - Navigation header with an icon-only back arrow button (`ChevronLeft` with `aria-label="Back"`, no visible "Back" text) that pops `drillStack`, alongside the current path label.
    - Highlighted `Select "<currentParent.name>"` row at the top.
    - Grouped `Sub-items` list below with direct children (drilling deeper or selecting if leaf).
- **Dismissal**: Close and reset `drillStack` + `query` on outside click or `Escape`.

## Risks / Trade-offs

- **Popover clipping inside overflow containers (e.g. `ScannerDrawer`)** → Ensure `<HierarchySelect />` popover uses `z-50` and appropriate max-height (`max-h-72 overflow-y-auto`) and test inside `ScannerDrawer` and `ProductDetailPage` bulk action bar.
- **Keyboard shortcuts firing while typing in dropdown search** → `Layout.tsx` already suppresses global shortcuts when `target.tagName === "INPUT"`, so typing in the dropdown search input will not trigger `g`/`n` shortcuts; `Escape` inside the search input should stop propagation so it closes the dropdown without navigating back.

# Proposal

## Why

Nested categories and locations are currently rendered as flat `"Parent > Child > Grandchild"` strings in both the left navigation sidebar and native `<select>` dropdowns, which makes deep hierarchies noisy to scan and hard to navigate, and selected sidebar filters cannot be toggled off by clicking them again. Updating how hierarchies are rendered, filtered, and selected makes browsing and data entry faster and cleaner.

## What Changes

- Render nested categories and locations in the left navigation sidebar (and category/location management lists) as properly ordered, depth-indented trees showing each node's short name rather than `"Parent > Child > Grandchild"`.
- Allow clicking an already-selected category or location in the left sidebar filter to unselect it and clear the active taxonomy filter while preserving the selected status view.
- Replace native `<select>` category and location dropdowns across forms and scanner workflows with a searchable hierarchical drill-down dropdown:
  - Opens to top-level nodes; clicking a leaf selects it immediately, while clicking a parent drills into it.
  - When drilled into a parent node, displays a top `Select "<Name>"` option to select the parent itself, followed by a grouped list of its direct children (which drill further or select if leaf).
  - Includes a search input at the top at all drill levels that searches across the entire hierarchy and renders matches as `"Parent > Child > Grandchild"` for one-click selection.

## Capabilities

### New Capabilities
- `hierarchy-navigation`: Indented category/location sidebar trees, click-to-toggle filter clearing, and searchable hierarchical drill-down dropdowns.

### Modified Capabilities
<!-- None — `openspec/specs/` has no archived specs yet. -->

## Impact

- Frontend React components in `web/src/components/` (`Layout.tsx`, `ScannerDrawer.tsx`, new `HierarchySelect.tsx`) and pages in `web/src/pages/` (`ProductFormPage.tsx`, `ProductDetailPage.tsx`, `TaxonomyPages.tsx`).
- No backend API or database schema changes required (existing `/api/categories` and `/api/locations` responses already return `id`, `name`, `parent_id`, and `hierarchy_name`).

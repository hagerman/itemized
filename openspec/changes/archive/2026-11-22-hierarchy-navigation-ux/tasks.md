# Tasks

## 1. Hierarchy Utilities & Searchable Drill-Down Component

- [x] 1.1 Implement cycle-safe `buildHierarchyTree` and `flattenHierarchyTree` helpers plus the searchable hierarchical drill-down `<HierarchySelect />` component in `web/src/components/HierarchySelect.tsx` (top-level list, leaf select, parent drill-down with `Back` header, top `Select "<Name>"` option, grouped children, and persistent top search bar searching across all hierarchies and rendering `"Parent > Child > Grandchild"` results); verify unit tests in `web/src/components/HierarchySelect.test.tsx` cover leaf select, multi-level drill-down, `Select "<Parent>"`, cross-hierarchy search from both root and drilled-in levels, and clearing search (`npm test`).

## 2. Sidebar & Taxonomy Indentation + Filter Toggle

- [x] 2.1 Update `web/src/components/Layout.tsx` to render the sidebar `Locations` and `Categories` trees using `flattenHierarchyTree(buildHierarchyTree(...))` with depth-based indentation and short node names, and toggle off `location_id` / `category_id` when clicking an already-selected node while preserving `status`; verify component tests confirm indented rendering and click-to-unselect behavior (`npm test`).
- [x] 2.2 Update `web/src/pages/TaxonomyPages.tsx` to render category and location management lists with depth-based indentation and short names, and replace the parent `<select>` inputs with `<HierarchySelect />` (`allowEmpty`, `emptyLabel="Top-level"`).

## 3. Replace Category & Location Dropdowns Across Forms and Scanner

- [x] 3.1 Replace native `<select>` category and location dropdowns with `<HierarchySelect />` in `web/src/pages/ProductFormPage.tsx`, `web/src/pages/ProductDetailPage.tsx` (bulk transfer), and `web/src/components/ScannerDrawer.tsx` (Purchase category/location, Transfer destination, Inventory Audit location); verify `npm test`, `tsc --noEmit`, `vite build`, and `go build ./...` all pass cleanly.
- [x] 3.2 Update the drilled-in navigation header in `web/src/components/HierarchySelect.tsx` so the back control renders only the arrow icon (no visible `"Back"` text, with `aria-label="Back"`), update unit tests in `web/src/components/HierarchySelect.test.tsx` to verify, and rebuild (`npm test`, `tsc --noEmit`, `vite build`, `go build ./...`).

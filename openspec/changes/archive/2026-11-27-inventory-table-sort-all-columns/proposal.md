# Proposal

## Why

The inventory list table displays six data columns (`Product`, `Category`, `Location`, `Stock`, `Next Due`, and `Shopping List`), but users can currently sort by only three of them (`Product`, `Stock`, and `Next Due`), and the toolbar's sort dropdown duplicates table-header sorting on desktop viewports. Enabling sorting on all six columns, ordering the mobile sort dropdown to match the table column sequence, and hiding the toolbar sort dropdown on desktop keeps sorting consistent across breakpoints and declutters the desktop toolbar.

## What Changes

- Extend `GET /api/products` sorting (`sort` query parameter) to support `category`, `location`, and `shopping_list` in addition to `name`, `stock`, and `due_date`.
- Make all six data column headers (`Product`, `Category`, `Location`, `Stock`, `Next Due`, `Shopping List`) interactive sort buttons in the desktop inventory table, indicating the active sort column with `aria-sort` and highlight styling.
- Update the mobile sort dropdown options to include all six sortable columns in the exact order of the table columns (`Name`, `Category`, `Location`, `Stock Count`, `Soonest Due`, `Shopping List`).
- Hide both toolbar sort dropdown controls (the full `<select>` and the compact icon-only sort menu button) on desktop viewports (`>= 768px`, `md:hidden`) where the desktop table is shown, retaining them exclusively on mobile viewports (`< 768px`) where the card view is shown.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `inventory-catalog`: Extend `GET /api/products` `sort` parameter support to include `category`, `location`, and `shopping_list` alongside `name`, `stock`, and `due_date`.
- `web-ui`: Make all six desktop inventory table column headers sortable, order the mobile sort dropdown options identically to the table columns, and hide the toolbar sort dropdown controls on desktop viewports (`>= 768px`) while keeping them on mobile viewports (`< 768px`).

## Impact

- Backend API: `internal/api/catalog.go` (`handleListProducts`) and unit tests in `internal/api/api_test.go`.
- Frontend UI: `web/src/pages/ProductsPage.tsx` (`SORT_OPTIONS`, toolbar sort controls, and desktop table `<thead>`) and unit tests in `web/src/pages/ProductsPage.test.tsx`.
- No database schema changes, migrations, or breaking API changes (existing `sort` values remain supported).

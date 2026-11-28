# Proposal

## Why

In light mode, hovering over any of the six sortable column headers in the desktop Products table (`Product`, `Category`, `Location`, `Stock`, `Next Due`, `Shopping List`) applies a bare `hover:text-white` utility class against the table's white (`bg-white`) surface, causing the hovered header label and sort icon to disappear. Updating these column header buttons to use theme-aware hover contrast (`hover:text-slate-900 dark:hover:text-white`) restores visibility in light mode while preserving the existing dark-mode hover behavior.

## What Changes

- Update all six sortable desktop table header buttons in `web/src/pages/ProductsPage.tsx` (`Product`, `Category`, `Location`, `Stock`, `Next Due`, `Shopping List`) from `hover:text-white` to `hover:text-slate-900 dark:hover:text-white`, matching the hover-color convention used across the rest of the web UI.
- Add unit test coverage in `web/src/pages/ProductsPage.test.tsx` verifying that desktop table column header buttons apply light-mode (`hover:text-slate-900`) and dark-mode (`dark:hover:text-white`) hover classes without bare `hover:text-white`.

## Capabilities

### New Capabilities

_(None)_

### Modified Capabilities

- `web-ui`: Require desktop Products table sortable column header buttons to maintain legible hover contrast in both light mode and dark mode.

## Impact

- **Frontend UI**: `web/src/pages/ProductsPage.tsx` (6 sortable `<th>` `<button>` elements in the desktop products table).
- **Frontend Tests**: `web/src/pages/ProductsPage.test.tsx`.
- **Backend / APIs / Dependencies**: No backend, database, or dependency changes.

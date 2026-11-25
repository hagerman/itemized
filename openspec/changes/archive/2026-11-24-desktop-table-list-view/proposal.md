# Proposal

## Why

The inventory list pages (`In Stock`, `Shopping List`, `Due Soon`, `Overdue`, `All Items`, and category/location-filtered views) currently render products as a responsive card grid (`1` to `3` columns) across all viewports. While cards work well for narrow mobile screens, they consume excessive vertical and horizontal space on desktop viewports, making it harder to scan and compare many products at once.

## What Changes

- Render the inventory list views in `ProductsPage` as a compact, scannable HTML table on desktop viewports (`md:` / `>= 768px`) instead of a multi-column card grid.
- Preserve the existing single-column card layout on mobile viewports (`< 768px`) without losing any product information or status badges.
- Display all existing product fields in structured desktop table columns: Product name (navigating to `/products/:id`), Category, Location (next-due item location), Stock count, Next Due date (with Overdue and Due Soon badge treatments), and Shopping List status.
- Allow clicking sortable column headers (`Product`, `Stock`, `Next Due`) in the desktop table to update the active sort order in sync with the toolbar sort control.
- Add a leading selection checkbox column (header select-all and per-row checkboxes) to the desktop table view only — mobile cards remain checkbox-free.
- Display a desktop-only bulk actions bar when one or more products are selected, supporting bulk product deletion (with confirmation) for now in preparation for future bulk actions such as merging products.

## Capabilities

### New Capabilities
<!-- None -->

### Modified Capabilities
- `web-ui`: Update the `Products list, sorting, and quick search` requirement so inventory list pages render a compact table layout with desktop-only selection checkboxes and bulk product deletion on desktop viewports while retaining the card layout on mobile viewports.

## Impact

- **Frontend**: `web/src/pages/ProductsPage.tsx` and `web/src/pages/ProductsPage.test.tsx`.
- **Backend / API**: No backend or API changes required; `GET /api/products` already returns all fields needed for both table and card views, and bulk deletion reuses the existing `DELETE /api/products/{id}` endpoint.
- **Dependencies**: None; uses existing Tailwind CSS responsive utilities and Lucide icons.

# Proposal

## Why

On the Product detail page, in-stock items currently display their location and dates but do not show which variant is attached or provide a way to change an item's variant if it was entered incorrectly. Additionally, both the Product detail header and the inventory list cards display the product's `default_location_name`, which is often misleading once items have been moved or stored across multiple locations; users instead need to see the actual location of the next-due in-stock item.

## What Changes

- **Item variant display and editing on `/products/:id`**:
  - Remove item `#id` numbers from `Items in Stock` and display each item's attached variant name once (larger, neutral text, no `"Variant:"` prefix) followed by its full location path (smaller, muted neutral text, no `"Location:"` prefix) in both the mobile card layout and desktop table.
  - Allow users to adjust or clear an existing item's variant by checking item checkbox(es) and using the bulk action bar (`POST /api/items/bulk` with `action: "update_variant"`), keeping variant editing out of the way of normal browsing.
- **Next-due item location instead of default location**:
  - Compute `next_location_name` on `Product` responses in `internal/api/catalog.go` from the unconsumed item with the soonest non-empty `due_on_date` (treating missing due dates last, and breaking ties by lowest item `id` / first entered). Leave empty when no items are in stock.
  - Replace `default_location_name` with `next_location_name` in the Product detail header (`ProductDetailPage.tsx`) and on the inventory list cards (`ProductsPage.tsx`), omitting the location segment when no in-stock items exist.

## Capabilities

### New Capabilities
<!-- None — this refines existing inventory-catalog and web-ui capabilities. -->

### Modified Capabilities
- `inventory-catalog`: Compute `next_location_name` for each product from its soonest-due unconsumed item (tie-breaking by first entered) and support bulk `update_variant` on items.
- `web-ui`: Show `next_location_name` instead of `default_location_name` in the inventory list and Product detail header, and display and allow editing each in-stock item's variant on the Product detail page.

## Impact

- Backend: `internal/api/catalog.go` (`Product.NextLocationName` in `loadProducts`), `internal/api/items.go` (`update_variant` bulk action), and unit tests in `internal/api/api_test.go`.
- Frontend: `web/src/api.ts`, `web/src/pages/ProductsPage.tsx`, `web/src/pages/ProductDetailPage.tsx`, and unit tests in `web/src/pages/ProductDetailPage.test.tsx`.
- No database schema migrations required.

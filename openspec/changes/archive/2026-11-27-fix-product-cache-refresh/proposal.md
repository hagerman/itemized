# Proposal

## Why

When a user creates a new product or edits an existing product (such as renaming it on `/products/:id/edit` and saving), the application returns to `/products/:id` (or the user navigates to inventory lists, Quick Search, `/search`, or `/locations/:id`) displaying stale cached product data until a full browser reload or the 15-second React Query `staleTime` expires. This happens because `ProductFormPage` only invalidates the `["products"]` query key—omitting `["product", id]`, `["quick-search"]`, and `["location"]`—and other product/inventory mutation paths similarly omit one or more product-derived query caches.

## What Changes

- Ensure creating or editing a product on `ProductFormPage` (`/products/new`, `/products/:id/edit`) immediately updates/invalidates the product detail cache (`["product", id]` / `["product"]`), product list and sidebar count caches (`["products"]`), Quick Search / mobile `/search` caches (`["quick-search"]`), and location detail caches (`["location"]`) before navigating so the destination view displays the newly saved product data immediately without a manual browser reload.
- Introduce a shared inventory/product cache invalidation helper in the frontend and use it consistently across product and inventory mutation paths (`ProductFormPage`, `ProductDetailPage`, `ProductsPage`, `ScannerDrawer`, `QrActionPage`, and `TaxonomyPages`) so adding, editing, deleting, merging, or reclassifying products or mutating items refreshes all dependent views (`ProductDetailPage`, `ProductsPage`, sidebar status counts, desktop Quick Search, mobile `/search`, and `LocationDetailPage`).
- Add regression tests verifying that editing and creating products immediately reflects updated product fields on `/products/:id` and invalidates list, search, and location caches even when React Query has a non-zero `staleTime` matching production (`15_000` ms).

## Capabilities

### New Capabilities

### Modified Capabilities
- `web-ui`: Add requirement for immediate client-side refresh of product detail, inventory lists, sidebar counts, search results, and location views after creating, editing, or deleting products without requiring a manual browser reload.

## Impact

- **Frontend (`web/src/`)**:
  - `web/src/api.ts` (or a dedicated cache helper module imported by pages/components): shared inventory cache invalidation helper.
  - `web/src/pages/ProductFormPage.tsx`: update cached `["product", String(id)]` data on edit and invalidate all product-dependent caches (`["product"]`, `["products"]`, `["quick-search"]`, `["location"]`) on create and edit.
  - `web/src/pages/ProductDetailPage.tsx`, `web/src/pages/ProductsPage.tsx`, `web/src/components/ScannerDrawer.tsx`, `web/src/pages/QrActionPage.tsx`, `web/src/pages/TaxonomyPages.tsx`: consistently invalidate dependent caches including `["product"]`, `["quick-search"]`, and `["location"]` on product/item mutations.
  - `web/src/pages/ProductFormPage.test.tsx` (and related unit tests): regression tests with realistic `staleTime` verifying immediate refresh without reload.
- **Backend (`internal/`)**: No backend API or database changes required (`POST /api/products` and `PATCH /api/products/{id}` already return the hydrated `product` record).

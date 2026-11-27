# Proposal

## Why

Brand-new `itemized` instances start with an empty database (zero locations, zero categories, and zero products) and land users on a stark `"No products match this view."` dashboard. Because creating or purchasing a product requires selecting both a category and a location—and neither can be created inline from the dropdowns—first-time users hit an immediate dead end when trying to scan or add their first item.

## What Changes

- **Idempotent starter taxonomy endpoint**: Add `POST /api/onboarding/starter-taxonomy` accepting optional `{ locations, categories }` booleans (both defaulting to `true`) to seed a curated grocery-store category hierarchy (`Groceries` and `Household` trees) and a universal household location hierarchy (`Kitchen`, `Garage`, `Bathroom`, `Laundry` with freezers flagged), skipping any node that already exists case-insensitively under the same parent.
- **Home page onboarding empty state**: Replace the generic `"No products match this view."` placeholder on `/` when the household catalog has zero total products (and no active filters) with a focused **Get Started** card featuring:
  1. A 1-click **Load Starter Setup** action (which transitions to a completed check once at least one category and one location exist, alongside links to `/locations` and `/categories`).
  2. Direct **Scan / Action** and **+ New Product** triggers.
  3. A conditional mobile/camera HTTPS notice shown only when `!window.isSecureContext` on a non-localhost host, linking to the reverse-proxy/TLS docs.
  Also offer a 1-click starter load button on empty `/categories` and `/locations` pages.
- **Inline `+ Create` in hierarchical pickers**: Extend `HierarchySelect` with an optional `onCreate` capability (including an optional `Freezer` toggle when creating locations) so users can type and create a new category or location directly inside the dropdown under the currently drilled-in parent (or root), refreshing caches and selecting it immediately. Wire this into the Purchase workflow category and location dropdowns in `ScannerDrawer` (and the New/Edit Product form in `ProductFormPage` for consistency).

## Capabilities

### New Capabilities

<!-- None: all behaviors extend existing capabilities. -->

### Modified Capabilities

- `inventory-catalog`: Add idempotent starter taxonomy seeding (`POST /api/onboarding/starter-taxonomy`) for curated grocery-store categories and universal household locations.
- `hierarchy-navigation`: Add optional inline node creation (`+ Create "<name>"`) inside the hierarchical drill-down selector under the active drill-down parent (with optional `is_freezer` toggle for locations).
- `web-ui`: Add the empty-catalog onboarding card on the home page (with 1-click starter setup, direct scan/create actions, and conditional non-HTTPS camera warning), empty-state starter load buttons on `/categories` and `/locations`, and inline category/location creation wired into the Purchase scanner workflow and Product form dropdowns.

## Impact

- **Backend (`internal/api/`)**: New `POST /api/onboarding/starter-taxonomy` handler and curated starter taxonomy definition, plus Go tests and `docs/api.md` contract update.
- **Frontend (`web/src/`)**:
  - `web/src/components/HierarchySelect.tsx`: optional `onCreate` and location freezer-toggle support.
  - `web/src/components/ScannerDrawer.tsx` & `web/src/pages/ProductFormPage.tsx`: wire inline creation callbacks for Category and Location pickers.
  - `web/src/pages/ProductsPage.tsx` & `web/src/components/Layout.tsx`: empty-catalog onboarding card (and passing scanner-open trigger / total product count cleanly).
  - `web/src/pages/TaxonomyPages.tsx`: 1-click starter load CTA when categories or locations are empty.
  - Vitest unit/component tests and `docs/get-started/getting-started.md` refresh as needed.

# Design

## Context

See `proposal.md` for motivation and scope.

Current architecture constraints:
- **Backend**: Go `net/http` server in `internal/api/server.go` backed by single-connection SQLite (`internal/db`). Authenticated routes live on the `authed` mux under `/api/`. API docs are verified against registered routes by `internal/docsverify/api_docs_test.go`.
- **Frontend**: React + TanStack Query + Tailwind in `web/src/`.
  - `Layout.tsx` owns `scannerOpen` state and renders `<ScannerDrawer>` as well as fetching `["categories"]`, `["locations"]`, and `["products", "counts"]`.
  - `ProductsPage.tsx` renders inside `Layout`'s `children` and currently only fetches `/api/products?${queryStr}`.
  - `HierarchySelect.tsx` is a portal-based drill-down dropdown with search, used across `ScannerDrawer.tsx`, `ProductFormPage.tsx`, `ProductDetailPage.tsx`, and `TaxonomyPages.tsx`.

## Goals / Non-Goals

**Goals:**
- Let a brand-new user go from empty database to scanning/adding their first item in one click without leaving their flow.
- Keep starter taxonomy seeding deterministic, atomic, and idempotent across repeated calls or partially populated databases.
- Keep `HierarchySelect` backwards-compatible: existing call sites without `onCreate` behave identically.

**Non-Goals:**
- Forced multi-step post-login onboarding wizard (users land directly on `/` and can dismiss/ignore starter setup if they prefer manual setup).
- Quick `-1` consume on product cards, CSV/Grocy import-export, or outbound notifications (deferred to separate changes).
- Seeding sample products or items outside demo mode (starter setup seeds only categories and locations).

## Decisions

### 1. Dedicated Idempotent Starter Taxonomy Endpoint
- **Choice**: `POST /api/onboarding/starter-taxonomy` in a new file `internal/api/onboarding.go`, accepting `{ "categories"?: bool, "locations"?: bool }` (defaulting both to `true`).
- **Why**: Keeps the curated starter tree in one canonical server-side definition, executes atomically in a single SQLite transaction, and handles parent-child ID resolution cleanly without N sequential frontend `POST` requests.
- **Idempotency rule**: For each node in parent-first order, check `SELECT id FROM categories WHERE LOWER(TRIM(name)) = LOWER(?) AND parent_id IS ?` (and equivalent for `locations`). If found, reuse its ID as parent for its children; if not found, insert it and increment the created counter.
- **Curated tree**:
  - **Categories** (modeled after a grocery store + household essentials):
    - `Groceries` -> `Baked Goods`, `Baking Essentials`, `Beer, Wine, & Spirits`, `Beverages`, `Breakfast`, `Canned Goods & Soups`, `Condiments & Sauces`, `Dairy & Eggs`, `Delicatessen`, `Dry Goods, Grains, & Pasta`, `Frozen Foods`, `Herbs & Spices`, `Meat & Seafood`, `Oils & Vinegars`, `Prepared Foods`, `Produce`, `Snacks & Candy`
    - `Household` -> `Beauty & Personal Care`, `Cleaning Supplies`, `Medical Supplies`, `Office & Craft`, `Paper Goods`
  - **Locations**:
    - `Kitchen` -> `Pantry`, `Refrigerator`, `Freezer` (`is_freezer: true`), `Cabinets`
    - `Garage` -> `Chest Freezer` (`is_freezer: true`), `Storage`
    - `Bathroom` -> `Cabinet`
    - `Laundry`
- **Alternative considered**: Seeding categories/locations in SQL migration `001_initial.sql`. Rejected because users who want a custom taxonomy or clean slate would have to manually delete 30+ nodes, and existing test suites assume a clean empty database after migrations.

### 2. Triggering `Scan / Action` from the Onboarding Card
- **Choice**: Expose a lightweight callback/event or context from `Layout.tsx` (e.g., a small `ScannerControlContext` or custom event / prop) so `ProductsPage.tsx` can open the existing `ScannerDrawer` in `"purchase"` mode directly from the Get Started card.
- **Why**: Avoids rendering a duplicate `ScannerDrawer` instance or duplicating camera/modal state inside `ProductsPage.tsx`.
- **Alternative considered**: URL query param `?scan=purchase`. Rejected to avoid polluting browser history and back-button navigation on iOS PWA.

### 3. Detecting True Empty Catalog vs. Empty Filtered View
- **Choice**: Read `["products", "counts"]` (already fetched by `Layout.tsx` via `GET /api/products?status=in_stock`, which returns `status_counts.all`) alongside `["categories"]` and `["locations"]` in `ProductsPage.tsx`. Render the Get Started card only when `counts.all === 0 && !hasActiveFilters && !isLoading`.
- **Why**: Zero extra API requests; cleanly distinguishes a brand-new instance from a user whose `Overdue` or `Due Soon` filter happens to have 0 items.

### 4. Inline Creation UX in `HierarchySelect`
- **Choice**: Add optional props to `HierarchySelect`:
  - `onCreate?: (input: { name: string; parent_id: number | null; is_freezer?: boolean }) => Promise<T>`
  - `createEntityLabel?: string` (e.g., `"category"` or `"location"`)
  - `showFreezerOption?: boolean` (only `true` for location pickers)
- **Behavior**:
  - Track `creating`, `createError`, and `newIsFreezer` state inside `HierarchySelect`.
  - When `onCreate` is provided and `trimmedQuery.length > 0` and no existing sibling under the current drill-down parent matches `trimmedQuery` case-insensitively, render a footer action `+ Create "<trimmedQuery>"` (showing `in <currentParent.name>` when drilled into a parent), plus a compact `Freezer` checkbox when `showFreezerOption` is true.
  - When `items.length === 0` and `trimmedQuery.length === 0`, show a helpful prompt inside the dropdown (`Type a name to create your first category/location...`).
  - On click (or Enter when no exact match is highlighted), call `onCreate`, select the returned item's `id`, reset search/freezer state, and close the menu.
- **Alternative considered**: Opening a separate modal on top of `ScannerDrawer` to create a category/location. Rejected because stacked modals feel heavy on mobile and break the rapid barcode-scan flow.

## Risks / Trade-offs

- **Auth scope of starter taxonomy endpoint**: Allowing any authenticated user (not just admins) matches `POST /api/categories` and `POST /api/locations`, which are already open to all authenticated household members. → Keep on the standard `authed` mux.
- **Demo mode**: Demo mode already seeds products (`status_counts.all > 0`), so the empty-catalog onboarding card will not appear in demo mode unless all products are deleted. → Acceptable and expected.
- **Docs verification test (`internal/docsverify/api_docs_test.go`)**: Adding `POST /api/onboarding/starter-taxonomy` will fail `make check` unless documented in `docs/api.md` and rebuilt via `make docs-build`. → Include explicit API docs and `make check` tasks in `tasks.md`.

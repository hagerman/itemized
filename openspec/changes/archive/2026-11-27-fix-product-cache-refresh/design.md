# Design

## Context

See `proposal.md` for motivation. In `web/src/App.tsx`, the React Query `QueryClient` is configured with `defaultOptions: { queries: { retry: 1, staleTime: 15_000 } }`. Product and item data are cached across four query key families:

- `["products", ...]` — `ProductsPage` filtered lists (`["products", queryStr]`) and `Layout` sidebar status counts (`["products", "counts"]`)
- `["product", id]` — `ProductDetailPage` and `ProductFormPage` single-product detail (`{ product, variants, items }`)
- `["quick-search", query]` — `Layout` Quick Search modal and `SearchPage` (`/search`)
- `["location", id]` — `LocationDetailPage` (`/locations/:id`), which renders items including `product_name`

Because `staleTime` is 15 seconds, any query key family omitted from invalidation serves stale data when a user navigates to a view within 15 seconds. Currently, `ProductFormPage` only invalidates `["products"]` on save, leaving `["product", id]`, `["quick-search"]`, and `["location"]` stale. Other mutation call sites (`ProductDetailPage`, `ProductsPage`, `ScannerDrawer`, `QrActionPage`, `TaxonomyPages`) also omit one or more of these key families.

## Goals / Non-Goals

**Goals:**
- Guarantee that editing or creating a product via `ProductFormPage` immediately shows the updated product on `/products/:id` with no stale flash and refreshes lists, sidebar counts, search results, and location views without a browser reload.
- Standardize product/inventory cache invalidation through a single shared helper used by all product and inventory mutation paths.
- Verify the fix with automated tests configured with a non-zero `staleTime` matching production (`15_000` ms).

**Non-Goals:**
- Changing the global `staleTime: 15_000` setting (keeps normal navigation fast and avoids redundant network requests when no mutation has occurred).
- Modifying backend API endpoints (`POST /api/products` and `PATCH /api/products/{id}` already return the hydrated `product` payload).
- Adding server-push / WebSocket synchronization across separate browser sessions.

## Decisions

### 1. Shared `invalidateInventoryQueries(qc)` helper in `web/src/api.ts`
- **Decision**: Export a small helper `invalidateInventoryQueries(qc: QueryClient)` from `web/src/api.ts` that invalidates `["products"]`, `["product"]`, `["quick-search"]`, and `["location"]`. Use it across `ProductFormPage`, `ProductDetailPage`, `ProductsPage`, `ScannerDrawer`, `QrActionPage`, and `TaxonomyPages` (for category/location edits that affect product/search views).
- **Rationale**: Six separate files currently duplicate partial lists of `qc.invalidateQueries(...)` calls, which caused `["product"]`, `["quick-search"]`, and `["location"]` to be missed in different places. Centralizing the inventory-dependent key families prevents future drift.
- **Alternatives considered**:
  - *Inline `invalidateQueries` calls in `ProductFormPage` only*: Fixes the most visible bug but leaves `["quick-search"]`, `["location"]`, and bulk/detail/scanner mutations inconsistent.
  - *Lowering `staleTime` to `0` globally*: Causes unnecessary refetches on every back/forward navigation even when nothing changed.

### 2. Immediate cache update + invalidation on `ProductFormPage` save
- **Decision**: After `PATCH /api/products/${id}` succeeds in `ProductFormPage.handleSubmit`, synchronously update the cached `["product", String(res.product.id)]` entry via `qc.setQueryData` when an entry already exists (`prev ? { ...prev, product: res.product } : prev`), then call `invalidateInventoryQueries(qc)` before `navigate(`/products/${res.product.id}`)`. For `POST /api/products`, call `invalidateInventoryQueries(qc)` before `navigate(`/products/${res.product.id}`)`.
- **Rationale**: In TanStack Query v5, `invalidateQueries` marks all matching queries (active and inactive) stale synchronously, ensuring the destination route refetches on mount. Pairing it with `setQueryData` on edit eliminates even a brief flash of the old product name on `/products/:id` while the background refetch completes, without blocking navigation on an extra network round-trip.
- **Alternatives considered**:
  - *`await qc.invalidateQueries(...)` before `navigate(...)`*: Adds latency before route transition and does not refetch inactive queries until mount anyway.
  - *`invalidateQueries` without `setQueryData`*: Briefly renders the stale cached name on `/products/:id` until the refetch resolves.

### 3. Remove deleted product detail cache on `ProductDetailPage` delete
- **Decision**: When deleting a product from `ProductDetailPage`, call `qc.removeQueries({ queryKey: ["product", id] })` before `invalidateInventoryQueries(qc)` and `navigate("/")`.
- **Rationale**: Prevents an active `["product", id]` query from firing a spurious `GET /api/products/:id` (404) refetch during unmount while still invalidating all other inventory, search, and location queries.

## Risks / Trade-offs

- **Risk**: `setQueryData` on `["product", String(res.product.id)]` could write an incomplete shape (missing `variants` or `items`) if the cache entry did not exist yet.
  - **Mitigation**: Only merge `product: res.product` when `prev` is already defined (`prev ? { ...prev, product: res.product } : prev`); otherwise leave the cache entry undefined so `ProductDetailPage` fetches the full `{ product, variants, items }` payload normally.
- **Risk**: Invalidating `["quick-search"]` and `["location"]` on every inventory mutation could increase API requests.
  - **Mitigation**: TanStack Query's default `refetchType: "active"` only refetches currently mounted queries and merely marks inactive queries stale for next mount, so no extra requests occur for unmounted views.

# Design

## Context

See `proposal.md` for motivation. In `web/src/components/ScannerDrawer.tsx`:
- `Purchase` mode already stores product search results in `purchaseSearchHits` and renders a `Matching Products` list (up to 8 products, showing `p.name` and `p.category_name`) when a non-barcode query returns matches from `GET /api/products?status=all&q=...`.
- `Consume` and `Open` modes already query `GET /api/products?status=in_stock&q=...` for non-barcode unknown inputs, auto-loading `GET /api/products/:id` when `search.products.length === 1`, but falling back to a dead-end status banner (`"Found N matching products; refine your search or scan a label."`) when `length !== 1`.
- `Transfer` mode currently treats all `res.kind === "unknown"` inputs as `"Unrecognized barcode or QR code."`.

No backend changes are needed: `GET /api/products?status=in_stock&q=...` already filters to in-stock products matching the query, and `GET /api/products/:id` already returns unconsumed items ordered for selection (`listItemsByProduct(ctx, id, false)`).

## Goals / Non-Goals

**Goals:**
- Provide a consistent `Matching Products` selection list across `Consume`, `Open`, and `Transfer` modes visually matching `Purchase` mode.
- Reuse a single shared helper for loading a selected product's in-stock items into `candidateItems` (preserving mode-specific heading and pre-selection rules).
- Keep unknown 6–14 digit numeric barcode behavior intact in all modes (inline barcode association in `Consume`/`Open`, unrecognized barcode error in `Transfer`).
- Ensure transient product search hits are cleared cleanly on product selection, subsequent scans, mode switches, and modal close (via `resetSubState()` and unmount).

**Non-Goals:**
- Adding live type-ahead / debounced search-as-you-type on every keystroke (consistent with `Purchase` mode, search triggers on form submit / pressing Enter / clicking Go).
- Adding product-name search to `Inventory` audit mode (not requested and has different audit-count semantics).
- Changing backend API endpoints or query parameters.

## Decisions

### 1. Separate `actionSearchHits` state for Consume / Open / Transfer
- **Decision**: Add `actionSearchHits: Product[]` state in `ScannerDrawerContent` (cleared in `resetSubState()`, at the start of `handleConsumeOpenScan` / `handleTransferScan`, and when a product is picked or candidates are applied/transferred).
- **Rationale**: Keeps `Purchase` state (`purchaseSearchHits`, which stays visible alongside `creatingNew` during unknown-UPC lookup) decoupled from `Consume`/`Open`/`Transfer` search hits, avoiding unintended coupling with `hasPurchaseContent` and idle modal height invariants.
- **Alternative considered**: Reusing `purchaseSearchHits` across all modes. Rejected because `hasPurchaseContent` checks `purchaseSearchHits.length > 0` and Purchase keeps hits visible while `creatingNew` is true.

### 2. Shared helper for product-name search and product selection
- **Decision**: Extract two small helpers inside `ScannerDrawerContent`:
  - `loadProductCandidates(product: Product, targetMode: "consume" | "open" | "transfer")`: clears `actionSearchHits`, fetches `GET /api/products/${product.id}`, and populates `candidateItems`, `candidateHeading` (`Select items of ${product.name}`), and `selectedItemIds` (pre-selecting the first unstaged item in `transfer`, or the first item in `consume`/`open`), or sets a `No in-stock items found for ${product.name}.` status message if empty.
  - `searchInStockProducts(raw: string, targetMode: "consume" | "open" | "transfer")`: clears stale `candidateItems`/`candidateHeading`/`selectedItemIds`/`actionSearchHits`, calls `GET /api/products?status=in_stock&q=${encodeURIComponent(raw)}`, and branches:
    - `0` matches → `setStatusMsg(\`No in-stock products matching "${raw.trim()}".\`)`
    - `1` match → calls `loadProductCandidates(search.products[0], targetMode)` directly
    - `2+` matches → `setActionSearchHits(search.products.slice(0, 8))`
- **Rationale**: Eliminates duplication between `Consume`/`Open` and `Transfer`, guarantees identical matching-product cap (`8`, same as `Purchase`), and ensures `Transfer` preserves its unstaged-item pre-selection logic.
- **Alternative considered**: Always showing the `Matching Products` list even for 1 match. Rejected because `Consume`/`Open` already auto-loads a single match (saving an extra click), and keeping single-match auto-load avoids regressing existing workflows.

### 3. Placement of `Matching Products` list in the modal layout
- **Decision**: Render the `Matching Products` block for `mode === "consume" || mode === "open" || mode === "transfer"` right above the `candidateItems` / mode workflow section (below status/error banners, above the Transfer staged list and candidate items list) using the exact same button styling as `Purchase` (`Matching Products` uppercase header, `p.name` on the left, `p.category_name` on the right).
- **Rationale**: In `Transfer` mode, placing `Matching Products` immediately below the scanner bar makes search results immediately visible without scrolling past the staged transfer list and destination picker. When `actionSearchHits` is empty, nothing is rendered, preserving the compact idle height invariant for `Consume` and `Open` modes.

### 4. Preserving numeric barcode detection in `Transfer`
- **Decision**: In `handleTransferScan`, when `res.kind === "unknown"`, check `/^\d{6,14}$/.test(raw.trim())`. If numeric, keep `setErrorMsg("Unrecognized barcode or QR code.")`; otherwise call `searchInStockProducts(raw, "transfer")`.
- **Rationale**: Matches `Purchase` and `Consume`/`Open` barcode vs. text-search discrimination and prevents an unrecognized UPC scan from being treated as a product-name search.

## Risks / Trade-offs

- **Race condition between product click and subsequent scan** → Each new scan clears `actionSearchHits`, and `loadProductCandidates` is a single fast local API call; wrapping in `try/catch` surfaces any network error cleanly via `setErrorMsg`.
- **Longer Transfer modal when both `Matching Products` and staged items are visible** → Capping search hits at 8 (same as `Purchase`) and clearing `actionSearchHits` as soon as a product is clicked keeps the modal compact and within the existing `max-h-[92dvh]` scroll container.

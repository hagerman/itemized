# Design

## Context

See [proposal.md](./proposal.md) for motivation. All inventory list views (`In Stock`, `Shopping List`, `Due Soon`, `Overdue`, `All Items`, plus category- and location-filtered views) are rendered by a single React component, `web/src/pages/ProductsPage.tsx`, at route `/`. Currently, when products are loaded, `ProductsPage` renders a responsive card grid (`grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3`) across all viewports. Other management list pages (`CategoriesPage`, `LocationsPage`, `LocationDetailPage`, and `SearchPage`) already use compact single-row list containers (`divide-y divide-slate-800`) rather than card grids. `ProductDetailPage.tsx` already establishes the repo's responsive mobile-cards / desktop-table (`md:hidden` / `hidden md:block`) and indigo bulk-actions bar conventions.

## Goals / Non-Goals

**Goals:**
- Replace the multi-column card grid on desktop viewports with a dense, scannable HTML `<table>` in `ProductsPage`.
- Keep the existing single-column card layout intact and checkbox-free on mobile viewports.
- Preserve every data field, status badge (Overdue, Due Soon, Shopping List), and navigation behavior across both layouts.
- Support clicking sortable table column headers (`Product`, `Stock`, `Next Due`) synced with the existing `sort` state and toolbar dropdown.
- Provide desktop-only product selection checkboxes and a bulk actions bar supporting bulk deletion, ready to host future bulk product actions (such as merging products).

**Non-Goals:**
- Implementing product merging UI or API (deferred to a separate proposal).
- Exposing selection checkboxes or bulk product actions in the mobile card view.
- Changing the backend `/api/products` API, adding new server-side sort directions (ascending/descending toggle), or adding pagination.
- Redesigning `CategoriesPage`, `LocationsPage`, `LocationDetailPage`, or `SearchPage`, which already render compact row lists.
- Adding a manual card/table view toggle persisted in user preferences.

## Decisions

### 1. Responsive Breakpoint: `md:` (`768px`)
- **Decision**: Render the mobile card stack with `grid grid-cols-1 gap-3 md:hidden`, the desktop bulk actions bar with `hidden md:flex`, and the desktop table container with `hidden md:block`.
- **Rationale**: `md:` (`768px`) matches both `ProductDetailPage.tsx`'s items table breakpoint and the breakpoint where `ProductsPage` previously switched from single-column mobile cards to multi-column desktop cards (`md:grid-cols-2`). Phones stay in the touch-friendly card view while tablets in landscape and narrower desktop windows get the compact table view.
- **Alternative considered**: `lg:` (`1024px`, matching the persistent sidebar breakpoint in `Layout.tsx`). Rejected because desktop browser windows between `768px` and `1023px` (e.g., half-screen tiled windows) benefit significantly from the table layout rather than oversized cards.

### 2. Table Columns and Visual Styling
- **Decision**: Render a bordered, rounded container (`hidden overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900/60 md:block`) with no outer horizontal padding—instead applying `pl-4` on the first column (`th`/`td`) and `pr-4` on the last column (`th`/`td`) so row hover (`hover:bg-slate-800/50`) and selected-row (`bg-indigo-500/10`) highlights span edge-to-edge across the container—while keeping shared header typography (`border-b border-slate-800 text-xs font-semibold uppercase text-slate-400`, no separate darker header background band, no `tracking-wide`) consistent with `ProductDetailPage.tsx`. Columns:
  1. **Selection** (checkbox, desktop-only): Header select-all checkbox (`aria-label="Select all products"`) and per-row checkbox (`aria-label={`Select ${p.name}`}`).
  2. **Product** (sortable: `name`): Product name rendered as a `<Link to={`/products/${p.id}`}>` in `font-medium text-white group-hover:text-indigo-300`.
  3. **Category**: `p.category_name` in muted slate text (`text-slate-300`).
  4. **Location**: `p.next_location_name` (or `—` when absent/out of stock).
  5. **Stock** (sortable: `stock`): Right-aligned numeric stock pill or tabular-nums count (`p.in_stock_count`).
  6. **Next Due** (sortable: `due_date`): Reuses the existing due-date treatments — rose `Overdue (date)` badge, amber `Due date` badge, plain muted date, or `—` when no due date.
  7. **Shopping**: Indigo `Need X` / `Shopping List` badge when `p.on_shopping_list`, or `—` when not on the shopping list.
- **Rationale**: Separates each attribute into aligned columns for rapid vertical scanning while keeping header typography, weight (`font-semibold`), spacing, and inset borders visually consistent with `ProductDetailPage.tsx`'s desktop table.

### 3. Row Click Navigation with Native Link Semantics
- **Decision**: Keep a real `<Link to={`/products/${p.id}`}>` on the Product name cell and attach an `onClick` handler on `<tr>` (using `useNavigate`) that navigates to `/products/${p.id}` when the click target is not an interactive element (`a`, `button`, `input`, `label`) and no modifier key (`metaKey`, `ctrlKey`, `shiftKey`, `altKey`) is held. Also call `e.stopPropagation()` on the checkbox cell/input.
- **Rationale**: Users on desktop expect clicking anywhere on a table row to open the product, while checkbox toggles never accidentally trigger navigation and native link accessibility (Tab navigation, right-click context menu, Cmd/Ctrl-click open-in-new-tab) is preserved.

### 4. Sortable Column Headers Synced with Toolbar Sort
- **Decision**: Render interactive `<button type="button">` elements inside the `Product`, `Stock`, and `Next Due` `<th>` cells that call `setSort("name" | "stock" | "due_date")`, set `aria-sort="ascending"` on the active `<th>`, and highlight the active header with a subtle indicator.
- **Rationale**: Clicking column headers is standard desktop table UX and maps 1:1 to the existing `SORT_OPTIONS` (`name`, `due_date`, `stock`) already supported by `/api/products`, without adding backend complexity.

### 5. Dual-DOM Rendering vs JS Media Queries
- **Decision**: Render both the mobile card list (`md:hidden`) and desktop table (`hidden md:block`) using Tailwind CSS responsive classes rather than `window.matchMedia` JS listeners.
- **Rationale**: Matches the existing pattern used across `Layout.tsx`, `ProductDetailPage.tsx`, and `ProductsPage.tsx` (zero hydration/resize flicker, works cleanly in SSR/jsdom tests, and keeps component state minimal). Inventory lists are household-sized (tens to low hundreds of products), so the DOM cost is negligible.

### 6. Desktop Bulk Selection & Deletion
- **Decision**: Track `selectedIds: number[]` in `ProductsPage`, reset `selectedIds` whenever `queryStr` changes, and display a desktop-only floating bulk actions bar (`sticky bottom-4 z-20 mx-auto hidden w-fit items-center gap-3 rounded-xl border border-indigo-500/40 bg-slate-900/95 px-4 py-2.5 text-xs shadow-2xl backdrop-blur md:flex`, `data-testid="products-bulk-bar"`) positioned below the table so it stays pinned at the bottom of the scrolling `<main>` viewport without shifting table rows downward when the first checkbox is checked. It shows `{N} selected:` and a `Delete` button (`bg-rose-600`). On click, confirm via `window.confirm(...)` (matching `ProductDetailPage`'s product delete confirmation), issue `DELETE /api/products/{id}` for each selected product via `Promise.allSettled`, clear successfully deleted IDs (keeping any failed IDs selected and displaying an inline error alert), and invalidate `["products"]` queries so both the list and sidebar badge counts refresh.
- **Rationale**: Placing the bar as a sticky floating bar at the bottom of the scroll container keeps it accessible while scrolling long product lists, avoids layout shift under the cursor when checking rows, and centers naturally inside `<main>` regardless of sidebar width. Reusing the existing `DELETE /api/products/{id}` endpoint avoids introducing a premature bulk-products API contract before merge semantics are defined in a separate proposal.
- **Alternative considered**: Adding a new `POST /api/products/bulk` backend endpoint (deferred until merge requirements are defined) or rendering an inline bar above the table (causes vertical layout shift and scrolls out of view on long lists).

## Risks / Trade-offs

- **Risk**: Existing tests in `ProductsPage.test.tsx` using `screen.getByText("Test")` will match both the hidden mobile card and the desktop table row in jsdom (since jsdom does not evaluate Tailwind CSS media queries). → **Mitigation**: Scope assertions in `ProductsPage.test.tsx` using `within(screen.getByTestId("products-table"))` and `within(screen.getByTestId("products-card-list"))` (or `getAllByText`), and explicitly test both containers and their responsive classes (`hidden md:block` and `md:hidden`).
- **Risk**: Selecting products under one filter/status and switching filters could leave hidden products selected and risk accidental deletion. → **Mitigation**: Clear `selectedIds` in an effect whenever `queryStr` changes and ensure select-all only operates on the currently rendered `products` array.
- **Risk**: Long category or location hierarchy paths could cause narrow desktop tables to feel cramped. → **Mitigation**: Wrap the table in `overflow-x-auto` and use compact cell padding (`px-4 py-2.5`) with sensible `whitespace-nowrap` on checkbox, numeric, date, and badge columns so text columns wrap gracefully when needed.

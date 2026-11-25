# Design

## Context

See `proposal.md` for motivation and scope. Both affected views are in the React + Tailwind CSS v4 frontend (`web/src/pages/`):

- `ProductsPage.tsx` renders a toolbar containing a filter input (`min-w-[200px]`), a native `<select>` (`Sort: Name`, `Sort: Soonest Due`, `Sort: Stock Count`), an optional `Clear Filters` button, and a `+ New Product` `<Link>`. On narrow viewports, `flex-wrap` pushes the sort select and `New Product` button onto a second row.
- `ProductDetailPage.tsx` renders the product header with `flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between`, which unconditionally forces the 4 icon action buttons onto a left-aligned second row below `640px` (`sm`).

## Goals / Non-Goals

**Goals:**
- Keep `ProductsPage` filter, sort, and create controls on one horizontal row at all mobile and narrow container widths without clipping or horizontal overflow.
- Provide an accessible, dark-themed compact sort dropdown button on narrow widths while preserving the full labeled `<select>` and `+ New Product` button on wider widths.
- Allow `ProductDetailPage` header actions to sit right-aligned on the same row as the back button and product title whenever they fit, and wrap right-aligned onto a second row when the title or viewport is too narrow.

**Non-Goals:**
- Changing API endpoints, sort query parameters, or product detail actions.
- Altering `CategoriesPage`, `LocationsPage`, or `SearchPage` layouts (none of which have sort + new product toolbars).

## Decisions

### 1. Container-query responsive switch for `ProductsPage` toolbar
- **Choice**: Wrap the `ProductsPage` toolbar in a Tailwind v4 `@container` and switch between the compact controls and full-label controls at `@[540px]:` (540px container width).
- **Rationale**: The full-label controls require roughly `200px` (filter) + `165px` (`Sort: Soonest Due`) + `140px` (`+ New Product`) + `16px` (gaps) ≈ `521px`. Using a container query (`@container` / `@[540px]:`) responds to the actual available toolbar width — handling both mobile viewports and narrow desktop/tablet panes when the sidebar is open — with zero JS measurement flicker.
- **Alternative considered**: `ResizeObserver` / JS overflow detection. Rejected because it introduces layout thrash / flash of wrapped state on mount and complicates SSR/test rendering compared to pure CSS container queries.
- **Alternative considered**: Viewport `sm:` (`640px`) breakpoint only. Works for standard phones, but `@[540px]:` is slightly tighter and adapts cleanly if the sidebar is ever open on medium screens.

### 2. Compact sort dropdown button implementation
- **Choice**: Render two responsive representations synchronized to the same `sort` state:
  - Compact (`@[540px]:hidden`): A `<button type="button">` showing a Lucide `ArrowUpDown` icon (matching input height, `aria-label="Sort products"`, `aria-haspopup="listbox"`, `aria-expanded={sortMenuOpen}`) inside a `relative` wrapper. Clicking toggles a right-aligned dark popover menu (`role="listbox"`) listing `Name`, `Soonest Due`, and `Stock Count` with a `Check` icon on the active option. Clicking an option updates `sort` and closes the menu; clicking outside or pressing `Escape` closes the menu.
  - Full (`hidden @[540px]:block`): The existing `<select>` control (`Sort: Name`, `Sort: Soonest Due`, `Sort: Stock Count`).
- **Rationale**: A custom dark popover menu looks crisp across iOS Safari, Android, and desktop browsers, avoids iOS `<select>` opacity-overlay quirks, and is straightforward to test with React Testing Library.
- **Alternative considered**: Wrapping a transparent `<select className="absolute inset-0 opacity-0">` over an icon button. Rejected because invisible `<select>` overlays can have inconsistent hit-testing and screen-reader announcements, and cannot display a styled dark dropdown on desktop narrow windows.

### 3. Compact `New Product` button and `Clear Filters` placement
- **Choice**: Keep a single `<Link to="/products/new" aria-label="New Product" title="New Product">` that renders `<Plus className="h-4 w-4" />` plus `<span className="hidden @[540px]:inline">New Product</span>` with compact square padding below `@[540px]` and wider horizontal padding at `@[540px]:`. Keep the primary row `flex flex-nowrap items-center gap-2` with `min-w-0 flex-1` on the filter wrapper so `[Filter] [Sort] [+]` never wrap onto two lines even at `320px` width. Render the conditional `Clear Filters` button (when `categoryId || locationId || q` is active) either inline on wide containers or cleanly on a secondary row when compact so it never pushes `[Sort]` or `[+]` off the primary row.

### 4. CSS Flexbox single-line-preferred, right-aligned header on `ProductDetailPage`
- **Choice**: Change the `ProductDetailPage` header container from `flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between` to:
  - Outer container: `flex flex-wrap items-center justify-between gap-x-3 gap-y-2 sm:flex-nowrap`
  - Left title group: `flex min-w-0 max-w-full items-center gap-3` (no `flex-1`, so `flex-basis: auto` reflects the natural content width of the back button + title/subtitle)
  - Right actions group: `ml-auto flex shrink-0 items-center justify-end gap-1.5 sm:gap-2`
- **Rationale**: With `flex-wrap` and `flex-basis: auto` on the left group, CSS Flexbox naturally places the title and 4 icon buttons on a single line whenever `leftWidth + gap + rightWidth <= containerWidth` (right-aligning the buttons via `ml-auto` / `justify-between`). When the product title or category/location path is too wide to share the row, Flexbox automatically wraps the actions group onto a second line, where `ml-auto` keeps the buttons right-aligned. `min-w-0 max-w-full` ensures an extra-long title still truncates instead of overflowing horizontally, and `sm:flex-nowrap` preserves the single-row desktop header behavior.
- **Alternative considered**: Keeping `flex-1` on the left group with a fixed `min-w-[140px]`. Rejected because with `flex-1` + `truncate`, a medium-length title would always truncate aggressively rather than wrapping the buttons cleanly when the title doesn't fit.

## Risks / Trade-offs

- **Two sort controls in the DOM (one CSS-hidden per breakpoint)** → Keep the compact button's accessible name distinct or ensure tests target the compact trigger cleanly, and ensure both controls stay synchronized via the same `sort` state.
- **Popover menu clipping or z-index on `ProductsPage`** → Give the sort dropdown popover `z-20` and `right-0` alignment so it never overflows the right viewport edge and renders cleanly above product cards.
- **No Go code modified** → Only frontend files change, though per project verification rules we will still include the standard Go verification check alongside `npm test` and `npm run build`.

# Design

## Context

See `proposal.md` for motivation. Currently:
- `GET /api/products` in `internal/api/catalog.go` (`handleListProducts`) loads products ordered by `name COLLATE NOCASE ASC` (or by fuzzy relevance when `q` is set) and only handles `sort=due_date` and `sort=stock` in a `switch` block.
- `web/src/pages/ProductsPage.tsx` defines `SORT_OPTIONS` with 3 entries (`name`, `due_date`, `stock`) and renders two toolbar sort controls controlled by container query `@[540px]`: a `<select>` (`hidden @[540px]:block`) and a compact icon-only button menu (`@[540px]:hidden`).
- The desktop table (`data-testid="products-table"`) renders at `md:block` (`>= 768px`) with 6 data columns (`Product`, `Category`, `Location`, `Stock`, `Next Due`, `Shopping List`), of which only `Product`, `Stock`, and `Next Due` are interactive `<button>` headers. The mobile card list (`data-testid="products-card-list"`) renders at `md:hidden` (`< 768px`).

## Goals / Non-Goals

**Goals:**
- Support server-side sorting for all six inventory table columns (`name`, `category`, `location`, `stock`, `due_date`, `shopping_list`) with deterministic case-insensitive tie-breaking.
- Make all six desktop table column headers clickable sort buttons with consistent visual and `aria-sort` active state.
- Order `SORT_OPTIONS` identically to the desktop table columns (`Product`/`Name` → `Category` → `Location` → `Stock` → `Next Due` → `Shopping List`).
- Hide both toolbar sort dropdown controls whenever the desktop table is shown (`md:`, `>= 768px`), keeping them visible only when the mobile card view is shown (`< 768px`).

**Non-Goals:**
- Adding ascending/descending sort direction toggling (each column uses a single natural sort direction, matching existing `name`, `stock`, and `due_date` behavior).
- Changing how `next_location_name`, `category_name`, or `on_shopping_list` are computed or displayed.

## Decisions

### 1. Sort values and ordering semantics in `handleListProducts`
- **`category`**: Compare `strings.ToLower(p.CategoryName)` ascending, placing empty strings last, breaking ties by `strings.ToLower(p.Name)` ascending.
- **`location`**: Compare `strings.ToLower(p.NextLocationName)` ascending, placing empty strings last, breaking ties by `strings.ToLower(p.Name)` ascending. We sort by `NextLocationName` rather than `DefaultLocationName` because the table's `Location` column displays `p.next_location_name` (showing `—` when empty).
- **`shopping_list`**: Place `OnShoppingList == true` before `OnShoppingList == false`. Within `OnShoppingList == true`, sort by shortage amount (`LowStockAmount`, treating `nil` as `0`) descending so products with larger deficits appear first, followed by manually added items, breaking remaining ties by `strings.ToLower(p.Name)` ascending.
- **`due_date` & `stock`**: Retain existing behavior (soonest due first with unset last; highest `InStockCount` first), ensuring case-insensitive `name` tie-breaking.
- **Alternative considered**: Client-side sorting in React. Rejected because `GET /api/products` already owns `sort` (`due_date`, `stock`), URL query synchronization, and test coverage, so keeping all sort modes server-side preserves a single source of truth.

### 2. Mobile-only visibility of toolbar sort controls (`md:hidden`)
- Wrap or annotate both the `<select>` (`hidden @[540px]:block md:hidden`) and the compact icon-only sort menu container (`relative shrink-0 self-stretch @[540px]:hidden md:hidden`) so that at `>= 768px` (`md:`), neither toolbar sort control is rendered/visible regardless of the toolbar's `@container` width.
- Why both need `md:hidden`: On desktop viewports near `768px–800px` with the persistent sidebar visible, the main content container width can be `< 540px`, which would otherwise leave the `@[540px]:hidden` compact sort button visible next to the desktop table. Applying `md:hidden` to a shared wrapper (or both controls) guarantees exact parity with the `md:block` / `md:hidden` switch between the desktop table and mobile card list.

### 3. `SORT_OPTIONS` order and labels
- Order `SORT_OPTIONS` to match the desktop table columns left-to-right:
  1. `{ value: "name", label: "Name", selectLabel: "Sort: Name" }`
  2. `{ value: "category", label: "Category", selectLabel: "Sort: Category" }`
  3. `{ value: "location", label: "Location", selectLabel: "Sort: Location" }`
  4. `{ value: "stock", label: "Stock Count", selectLabel: "Sort: Stock Count" }`
  5. `{ value: "due_date", label: "Soonest Due", selectLabel: "Sort: Soonest Due" }`
  6. `{ value: "shopping_list", label: "Shopping List", selectLabel: "Sort: Shopping List" }`
- Existing option labels (`Name`, `Stock Count`, `Soonest Due`) are preserved for continuity while reordered so `Stock Count` precedes `Soonest Due`, matching `Stock` preceding `Next Due` in the table.

### 4. Desktop table header consistency
- Render all six data column headers (`Product`, `Category`, `Location`, `Stock`, `Next Due`, `Shopping List`) with the same clickable `<button>` + `<ArrowUpDown />` pattern, active highlight class (`text-indigo-300` vs `text-slate-400`), and `aria-sort` attribute on the `<th>`.
- Use `aria-sort="descending"` for `stock` and `shopping_list` (which sort highest-first / active-first) and `aria-sort="ascending"` for `name`, `category`, `location`, and `due_date`, or keep `aria-sort` accurately aligned with each column's direction. (Using accurate `ascending`/`descending` reflects the actual sort order; note existing tests check `aria-sort` on `Stock`—update tests accordingly if changed, or document clearly in `tasks.md`.)

## Risks / Trade-offs

- [Existing frontend tests assert old `SORT_OPTIONS` classes and `aria-sort` values] → Update `web/src/pages/ProductsPage.test.tsx` to verify `md:hidden` on both toolbar sort controls, the exact 6-option column order in both mobile sort controls, and clicking all 6 desktop column headers.
- [Users resizing a desktop browser across `768px` while the compact sort menu is open] → Because `sort` state is shared, resizing preserves the active sort seamlessly; the menu closes on outside click or `Escape`.

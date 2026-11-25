# Proposal

## Why

On narrow mobile viewports, the inventory index toolbar (`ProductsPage`) wraps the full-width `Sort: ...` select and `+ New Product` button onto a second line below the filter box, consuming vertical screen space above the product list. On the Product detail page (`ProductDetailPage`), the header always stacks its four action buttons onto a left-aligned second row on mobile even when the title and action buttons can fit on a single line, creating awkward visual balance.

## What Changes

- **Compact single-line index toolbar on narrow viewports**: In `ProductsPage`, when the filter input, full sort dropdown, and `+ New Product` button do not fit on one line, replace the sort `<select>` with a compact icon-only sort dropdown button (opening a dropdown menu of sort options) and replace the `New Product` button label with just a `+` icon button so filter, sort, and create controls stay on a single row while preserving full labels when space permits.
- **Right-aligned, single-line-preferred Product detail header actions**: In `ProductDetailPage`, update the header layout so the four action buttons (shopping list toggle, print label, edit, delete) are right-aligned and sit on the same row as the back button and product title whenever they fit, wrapping cleanly onto a right-aligned second row only when the title or viewport is too narrow.

## Capabilities

### New Capabilities
<!-- None -->

### Modified Capabilities
- `web-ui`: Update `Products list, sorting, and quick search` to require compact single-row toolbar controls (icon-only sort dropdown button and `+` create button) when the full sort dropdown and `New Product` button do not fit on one line with the filter box.
- `product-detail-responsive-ui`: Update `Single-row responsive product header actions` to require right-aligned header action buttons that stay on the same line as the product title when space permits and wrap right-aligned onto a second line when constrained.

## Impact

- **Frontend components**: `web/src/pages/ProductsPage.tsx`, `web/src/pages/ProductDetailPage.tsx`
- **Frontend tests**: New `web/src/pages/ProductsPage.test.tsx` and updated `web/src/pages/ProductDetailPage.test.tsx`
- **APIs / Backend / Dependencies**: None (pure frontend UI/layout change using existing `lucide-react` icons and Tailwind CSS v4 utilities)

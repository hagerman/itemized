# Proposal

## Why

When a user applies a filter (search text, category, or location) on the Inventory page at desktop/wider viewports (`>= 640px`), the inline `Clear Filters` button appears in the toolbar row, but the product list below shifts downward by 8px (`0.5rem`). This happens because the toolbar container uses Tailwind v4's `space-y-2`, which applies `margin-block-end: 0.5rem` to the primary toolbar row as soon as the narrow-viewport `Clear Filters` wrapper (`@[640px]:hidden`) is mounted as a second DOM child—even though that second child is hidden (`display: none`).

## What Changes

- Remove `space-y-2` from the `ProductsPage` toolbar container (`data-testid="products-toolbar"`) so hidden responsive children do not add trailing margin to the main toolbar row.
- Apply `mt-2` directly to the narrow-viewport `Clear Filters` wrapper (`@[640px]:hidden`) so vertical spacing between the toolbar row and the wrapped `Clear Filters` button is only applied when that row is actually visible below `640px`.
- Add unit test coverage in `web/src/pages/ProductsPage.test.tsx` verifying that active filters do not introduce trailing margin on the toolbar container when the narrow-viewport `Clear Filters` row is hidden, while preserving top margin when the narrow-viewport row is rendered.

## Capabilities

### New Capabilities

<!-- None -->

### Modified Capabilities

- `web-ui`: Update the `Products list, sorting, and quick search` requirement so toggling active filters and rendering the inline `Clear Filters` control on wider viewports does not shift the product list downward.

## Impact

- Affected frontend files: `web/src/pages/ProductsPage.tsx`, `web/src/pages/ProductsPage.test.tsx`.
- No backend, API, database, or dependency changes.

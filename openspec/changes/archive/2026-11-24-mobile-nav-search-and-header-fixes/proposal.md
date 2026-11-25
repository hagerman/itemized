# Proposal

## Why

On mobile and iOS standalone PWA viewports, three UI issues degrade everyday navigation and visual clarity: the mobile bottom navigation dock does not indicate when the Inventory tab (or Search tab) is active, tapping Search opens a modal overlay that loses the query and results when navigating to a product and going back, and the top header's `backdrop-blur` causes a visible blur artifact over the header controls on iOS. Addressing these together makes mobile navigation stateful, legible, and predictable.

## What Changes

- **Mobile bottom dock active highlighting**: Highlight the `Inventory` tab in the mobile bottom navigation dock when the inventory route (`/`) is active, and highlight the `Search` tab when the mobile search route (`/search`) is active, using a distinct foreground color rather than a background fill (since the two tabs sit on opposite sides of the central `Scan / Action` button).
- **Dedicated mobile search page (`/search`)**: Change the mobile bottom dock `Search` button from opening the Quick Search modal dialog to navigating to a dedicated `/search` page (assumption: the request's reference to the search button "at the top" refers to the mobile dock `Search` button, as no search button exists in the top header and the request specifies "the mobile search page"; desktop sidebar `Quick Search` remains a modal dialog).
- **Identical search behavior with history-preserving back navigation**: The `/search` page mirrors the Quick Search modal's behavior (auto-focused search input querying `GET /api/products?status=all&q=...` and listing matching products with stock counts), while omitting the divider and empty space below the input when no query is entered and displaying the divider with `"No products match this search."` when a query returns no results. The query is synchronized to the URL (`?q=...`), and selecting a result navigates to `/products/:id` with return context so both browser/iOS back navigation and the Product Detail page's in-app back button return directly to `/search?q=...` with the prior results intact.
- **Eliminate iOS top header blur**: Remove `backdrop-blur` and translucent background (`bg-slate-900/70`) from the top `<header>` in `Layout.tsx`, replacing it with a solid opaque background (`bg-slate-900`) since `<header>` sits above `<main>` in a flex column rather than floating over scrolling content.

## Capabilities

### New Capabilities

### Modified Capabilities
- `web-ui`: Update responsive application shell requirements for mobile bottom dock active tab highlighting and opaque non-blurred top header rendering on iOS, and update quick search requirements so mobile Search opens a dedicated `/search` page that preserves search query and results across back navigation from a product detail view.

## Impact

- **Frontend routes & pages**: `web/src/App.tsx` (add `/search` route), new `web/src/pages/SearchPage.tsx`, `web/src/pages/ProductDetailPage.tsx` (support returning to prior route such as `/search?q=...` from the back button).
- **Frontend layout**: `web/src/components/Layout.tsx` (highlight active mobile bottom dock tabs, link mobile `Search` tab to `/search`, remove `backdrop-blur` and use solid `bg-slate-900` on `<header>`).
- **Frontend tests**: `web/src/components/Layout.test.tsx`, new `web/src/pages/SearchPage.test.tsx`, and `web/src/pages/ProductDetailPage.test.tsx`.
- **Backend / APIs**: No backend or API changes required; reuses `GET /api/products?status=all&q=...`.

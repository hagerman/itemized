# Design

## Context

See `proposal.md` for motivation and scope. Currently in `web/src/components/Layout.tsx`:
- The top `<header>` uses `bg-slate-900/70 ... backdrop-blur` even though it is a `shrink-0` flex sibling above `<main className="flex-1 overflow-y-auto">` (nothing scrolls behind it). On iOS standalone PWAs and Safari, `backdrop-blur` combined with `env(safe-area-inset-top)` produces a visible blur over the header's hamburger icon and title.
- The mobile bottom dock (`<nav aria-label="Mobile navigation">`) renders `Inventory` as an unstyled `<Link to="/">` (`text-slate-300`) with no active route indicator, and `Search` as a `<button>` that toggles the same `searchOpen` modal state used by desktop sidebar `Quick Search`.
- `ProductDetailPage.tsx` hardcodes `<Link to="/" aria-label="Back to inventory">` for its back arrow, so navigating to a product from `/search` would otherwise jump back to `/` instead of the prior search results.

## Goals / Non-Goals

**Goals:**
- Highlight active tabs (`Inventory` on `/`, `Search` on `/search`) in the mobile bottom navigation dock using styling consistent with active sidebar items.
- Replace the mobile dock's modal trigger with a dedicated `/search` route (`SearchPage`) that matches Quick Search's API query, empty/populated rendering, and result layout.
- Preserve search query and results across both browser/OS back navigation and the `ProductDetailPage` in-app back button.
- Eliminate the iOS top-of-screen blur by removing `backdrop-blur` and translucent background from `<header>`.

**Non-Goals:**
- Changing the desktop sidebar `Quick Search` modal dialog or its backdrop-dismissal behavior.
- Adding new search filters, pagination, or backend API changes (continues to use `GET /api/products?status=all&q=...`).
- Modifying iOS PWA meta tags (`apple-mobile-web-app-status-bar-style="black-translucent"`, `viewport-fit=cover`) which are required for full-screen safe-area layout.

## Decisions

### 1. URL-driven search state on `/search` (`?q=...`) with `replace: true`
- **Decision**: `SearchPage` reads the initial and current query from `useSearchParams` (`searchParams.get("q") ?? ""`) and updates it via `setSearchParams(next, { replace: true })` as the user types (deleting `q` when empty).
- **Rationale**: Storing `q` in the URL query string means browser back / iOS swipe-back from `/products/:id` automatically restores `/search?q=...` and React Query's cache (`["quick-search", query]`) immediately renders the prior results without losing state or requiring custom global state. Using `{ replace: true }` avoids creating a history entry per keystroke so a single Back press returns to the page before `/search` (or from `/products/:id` returns to `/search?q=...`).
- **Alternatives considered**: Keeping query state in React Context or `sessionStorage`—rejected because URL state is idiomatic in React Router, survives reloads, and naturally participates in browser history.

### 2. Return-path propagation to `ProductDetailPage`
- **Decision**: When clicking a search result in `SearchPage`, navigate to `/products/${p.id}` with React Router location state `{ from: `${location.pathname}${location.search}` }`. In `ProductDetailPage`, read `(location.state as { from?: string } | null)?.from` and use it as the target of the back `<Link>` (falling back to `"/"` when absent, and adjusting `aria-label` to `"Back to search results"` when returning to `/search`).
- **Rationale**: Handles both native browser/iOS back gestures (via history stack) and the visible in-app back arrow on `ProductDetailPage`. Does not affect navigation from `ProductsPage`, scanner, or direct links (which still fall back to `"/"`).
- **Alternatives considered**: Using `navigate(-1)` on the back button—rejected because direct deep-links or QR scans to `/products/:id` could navigate outside the app instead of to `"/"`.

### 3. Mobile bottom dock active styling
- **Decision**: Convert the mobile dock `Search` button to `<Link to="/search">`. Highlight the active tab via foreground color (`text-indigo-400 font-semibold` and `aria-current="page"`) without changing its background color, keeping inactive tabs as `text-slate-400` (`Inventory` active when `loc.pathname === "/"`, `Search` active when `loc.pathname === "/search"`).
- **Rationale**: Because `Inventory` and `Search` sit on opposite sides of the central solid `bg-indigo-600` `Scan / Action` button, a subtle background color tint (`bg-indigo-600/20`) is hard to distinguish at a glance. Changing foreground color (`text-indigo-400`) against the dark dock surface gives an unmistakable active indicator.

### 4. Solid opaque `<header>` without `backdrop-blur`
- **Decision**: Change `<header>` in `Layout.tsx` from `bg-slate-900/70 ... backdrop-blur` to `bg-slate-900` (removing `backdrop-blur` entirely).
- **Rationale**: Because `<header>` is a non-overlapping flex sibling above `<main>`, `backdrop-blur` provides no transparency benefit over scrolling content while triggering WebKit's iOS header blur artifact. Using solid `bg-slate-900` matches the sidebar header and keeps the menu button and title sharp.

### 5. Conditional divider and empty-results state on `/search`
- **Decision**: In `SearchPage.tsx`, omit the divider (`border-b border-slate-800 pb-3`) and the results container when `query.trim().length === 0` (or while the initial fetch for a non-empty query is still loading with no data yet). Once results are present (`products.length > 0`) or a non-empty query finishes with zero matches (`!isLoading && products.length === 0`), show the divider and render either the product rows or `"No products match this search."`.
- **Rationale**: Avoids showing a dangling horizontal rule and blank gap on the initial empty search page while giving clear feedback when a search matches nothing.

## Risks / Trade-offs

- **Existing test selecting Quick Search button**: `Layout.test.tsx` currently queries `screen.getAllByRole("button", { name: /Search/i })` to click the desktop `Quick Search` button. Changing the mobile dock `Search` control from `<button>` to `<Link>` leaves a single matching button (the desktop sidebar `Quick Search`), so the existing test continues to pass and we can add explicit assertions for the mobile dock links and active states.
- **Mobile keyboard autofocus on iOS**: iOS Safari/PWA may suppress programmatic `autoFocus` on navigation unless triggered by a user gesture; rendering a standard `<input autoFocus>` matches desktop Quick Search behavior and remains immediately tappable with `16px` touch font sizing (no auto-zoom).

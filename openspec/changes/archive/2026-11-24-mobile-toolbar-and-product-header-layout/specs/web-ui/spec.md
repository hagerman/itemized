# Spec Delta

## MODIFIED Requirements

### Requirement: Products list, sorting, and quick search
The Products view SHALL display matching products with stock counts, next-due item location when in stock, next due date, and shopping-list/overdue indicators; provide filter, sort, and create controls that collapse into a compact single-row icon sort dropdown button and `+` create button when full labels do not fit on one line; and expose fuzzy search via desktop Quick Search and a dedicated mobile `/search` page that preserves results when navigating back.

#### Scenario: Compact single-row toolbar on narrow index viewports
- **WHEN** a user views an inventory index page (`In Stock`, `Shopping List`, `Due Soon`, `Overdue`, `All Items`, or a filtered category/location view) on a narrow viewport where the filter input, full `Sort: ...` select, and `+ New Product` button do not fit on one line
- **THEN** the toolbar keeps the filter input, sort control, and create button on a single horizontal line by rendering an icon-only sort dropdown button (with accessible label `Sort products`) and an icon-only `+` link (with accessible label `New Product`) instead of the full-width text controls

#### Scenario: Changing sort order via the compact sort dropdown button
- **WHEN** a user activates the compact sort dropdown button on a mobile index page
- **THEN** a dropdown menu opens displaying the available sort options (`Name`, `Soonest Due`, `Stock Count`) with the active option indicated, selecting an option updates the product list sort order and closes the menu, and clicking outside or pressing `Escape` closes the menu without changing the sort order

#### Scenario: Full-label toolbar controls on wider viewports
- **WHEN** a user views an inventory index page on a wider viewport where the filter input, full `Sort: ...` select, and `+ New Product` button fit on one line
- **THEN** the toolbar displays the filter input, full `Sort: ...` dropdown, and `+ New Product` button with visible text labels on a single row

#### Scenario: Quick fuzzy search navigates to product
- **WHEN** a user opens Quick Search from the desktop sidebar, types a partial product name, and selects a result
- **THEN** the application navigates directly to that product's detail view

#### Scenario: Mobile dock Search opens dedicated search page with identical behavior
- **WHEN** a user taps `Search` in the mobile bottom navigation dock
- **THEN** the application navigates to `/search` (instead of opening a modal dialog), displays an auto-focused search input with no divider or empty results space while the query is empty, queries `GET /api/products?status=all&q=...` as the user types, and displays a divider followed by matching products with their name and in-stock count identically to the Quick Search modal

#### Scenario: Mobile search page displays empty-results message when no products match
- **WHEN** a user enters a non-empty search query on `/search` that matches no products
- **THEN** the page displays the divider below the search input and renders `"No products match this search."`

#### Scenario: Navigating back from a product opened via mobile search restores prior search results
- **WHEN** a user enters a query on `/search`, selects a matching product to navigate to `/products/:id`, and then navigates back (either via browser/iOS back navigation or the Product Detail page's back button)
- **THEN** the application returns to `/search?q=<query>` with the prior search query populated and the prior matching search results displayed

#### Scenario: Inventory list displays next-due item location
- **WHEN** a user views the inventory list for a product whose next-due item is in `"Fridge"` while its default location is `"Pantry"`
- **THEN** the product card displays `"Fridge"` alongside the category instead of `"Pantry"`

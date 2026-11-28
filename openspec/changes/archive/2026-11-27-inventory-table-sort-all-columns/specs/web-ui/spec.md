# Spec Delta

## MODIFIED Requirements

### Requirement: Products list, sorting, and quick search
The Products view SHALL display matching products with stock counts, next-due item location when in stock, next due date, and shopping-list/overdue indicators in a compact desktop table with desktop-only selection checkboxes, bulk deletion, bulk product merging (when at least two products are selected), and bulk LLM name reclassification (when at least one product is selected and an LLM provider is configured), and a single-column mobile card layout; provide responsive filter, clear-filters, and create controls alongside desktop table column-header sorting across all six data columns (`Product`, `Category`, `Location`, `Stock`, `Next Due`, `Shopping List`) and a mobile-only sort dropdown (hidden on desktop viewports `>= 768px`) whose options appear in the exact order of the table columns; and expose fuzzy search via desktop Quick Search and a dedicated mobile `/search` page that preserves results when navigating back without exposing product merge or reclassification controls.

#### Scenario: Desktop viewports display inventory list pages as a compact table
- **WHEN** a user views an inventory list page (`In Stock`, `Shopping List`, `Due Soon`, `Overdue`, `All Items`, or a filtered category/location view) on a desktop viewport (`>= 768px`)
- **THEN** matching products are rendered in a semantic HTML table with a leading selection checkbox column (including a select-all header checkbox) followed by columns for Product, Category, Location, Stock, Next Due, and Shopping List (showing overdue, due-soon, and shopping-list badges where applicable) instead of a multi-column card grid, and activating a product link or non-checkbox portion of a row navigates to `/products/:id`

#### Scenario: Mobile viewports retain the single-column card view
- **WHEN** a user views an inventory list page on a mobile viewport (`< 768px`)
- **THEN** the desktop table and bulk actions bar are hidden and matching products render in the single-column card layout without selection checkboxes, displaying product name, stock count, category, next-due item location, due-date status, and shopping-list indicator

#### Scenario: Selecting products and bulk deleting from the desktop table
- **WHEN** a user on a desktop viewport selects one or more products using row checkboxes or the header select-all checkbox
- **THEN** toggling checkboxes updates the selection without navigating to `/products/:id`, a desktop-only floating bulk actions bar remains visible while scrolling showing the selected count and a `Delete` action, confirming deletion removes the selected products via `DELETE /api/products/{id}`, clears the selection, and refreshes the product list and sidebar counts (while canceling leaves products unchanged), and changing active filters, status, or search clears the current selection

#### Scenario: Merge bulk action appears only when at least two products are selected on desktop
- **WHEN** a user on a desktop viewport selects 1 product in the inventory list table
- **THEN** the floating bulk actions bar displays `Delete` and does not display `Merge`
- **AND** when the user selects a second product (2 or more selected), a `Merge` action appears alongside `Delete` in the floating bulk actions bar

#### Scenario: Merging selected products via destination selection modal
- **WHEN** a user on a desktop viewport selects two or more products, clicks `Merge` in the floating bulk actions bar, selects which product to keep as the destination in the Merge Products modal, and confirms the merge
- **THEN** the application sends `POST /api/products/merge` with the selected `target_product_id` and remaining `source_product_ids`, closes the modal, clears the selection, and refreshes the product list and sidebar counts (while canceling or dismissing the modal leaves products unchanged, and API errors are displayed inside the modal without losing the user's selection)

#### Scenario: Reclassify bulk action appears on desktop when LLM is configured
- **WHEN** a user on a desktop viewport selects one or more products in the inventory list table while an LLM provider is configured
- **THEN** a `Reclassify` action appears in the floating bulk actions bar alongside `Delete` (and `Merge` when 2+ products are selected)
- **AND** when no LLM provider is configured, the `Reclassify` action is hidden

#### Scenario: Reviewing, tweaking, excluding, and applying bulk reclassification with live merge preview
- **WHEN** a user clicks `Reclassify` on selected products
- **THEN** the Reclassify Products modal opens, fetches suggested standardized names from `POST /api/products/reclassify/suggest` (showing progress), and displays an editable table with per-row include/exclude checkboxes (defaulting unchanged names to unchecked), editable target-name inputs, and live action badges showing whether each included row will be renamed, merged into an unselected existing product, or merged with another included row sharing the same target name
- **AND** confirming sends only the included rows to `POST /api/products/reclassify/apply`, closes the modal, clears the selection, and refreshes the product list and sidebar counts

#### Scenario: Search views do not expose product merge controls
- **WHEN** a user uses desktop Quick Search or the mobile `/search` page
- **THEN** no selection checkboxes, product merge actions, or bulk reclassification actions are displayed

#### Scenario: Sorting inventory list via desktop table column headers
- **WHEN** a user views an inventory list page on a desktop viewport and clicks the `Product`, `Category`, `Location`, `Stock`, `Next Due`, or `Shopping List` column header button
- **THEN** the product list sort order updates to `name`, `category`, `location`, `stock`, `due_date`, or `shopping_list` respectively, fetches `/api/products` with that `sort` parameter, stays synchronized with the shared sort state, and indicates the active sort column

#### Scenario: Desktop viewports hide toolbar sort dropdown controls
- **WHEN** a user views an inventory list page on a desktop viewport (`>= 768px`) where the desktop table is displayed
- **THEN** both the full `Sort: ...` `<select>` dropdown and the compact icon-only sort dropdown button in the toolbar are hidden so users sort via the table column headers instead

#### Scenario: Compact single-row toolbar on narrow index viewports
- **WHEN** a user views an inventory index page (`In Stock`, `Shopping List`, `Due Soon`, `Overdue`, `All Items`, or a filtered category/location view) on a narrow mobile viewport (`< 768px`) where the filter input, full `Sort: ...` select, and `+ New Product` button do not fit on one line
- **THEN** the toolbar keeps the filter input, sort control, and create button on a single horizontal line by rendering an icon-only sort dropdown button (with accessible label `Sort products`) and an icon-only `+` link (with accessible label `New Product`) instead of the full-width text controls

#### Scenario: Changing sort order via the compact sort dropdown button
- **WHEN** a user activates the compact sort dropdown button on a mobile index page (`< 768px`)
- **THEN** a dropdown menu opens displaying the available sort options in the exact order of the desktop table columns (`Name`, `Category`, `Location`, `Stock Count`, `Soonest Due`, `Shopping List`) with the active option indicated, selecting an option updates the product list sort order and closes the menu, and clicking outside or pressing `Escape` closes the menu without changing the sort order

#### Scenario: Full-label toolbar controls on wider viewports
- **WHEN** a user views an inventory index page on a wider mobile viewport (`< 768px` with container width `>= 540px`)
- **THEN** the toolbar displays the filter input, full `Sort: ...` dropdown (with options in table column order), and `+ New Product` button with visible text labels on a single row
- **AND** on desktop viewports (`>= 768px`), the toolbar displays the filter input and `+ New Product` button without the toolbar sort dropdown

#### Scenario: Applying a filter on wider viewports shows inline Clear Filters without vertical layout shift
- **WHEN** a user applies an active filter (search text, category, or location) on an inventory index page at a wider viewport where the `Clear Filters` button fits inline in the primary toolbar row
- **THEN** the inline `Clear Filters` button appears in the primary toolbar row without adding extra vertical spacing below the toolbar or pushing the product list downward, while narrower viewports continue to render the wrapped `Clear Filters` button in a spaced secondary row below the primary toolbar row

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
- **THEN** the product entry (table row on desktop and card on mobile) displays `"Fridge"` instead of `"Pantry"`

# Design

## Context

See `proposal.md` for motivation and scope. Itemized stores generic `Product` records and brand-specific `Variant` / `Barcode` records in SQLite (`internal/db/migrations/001_initial.sql`, `002_product_merges.sql`), uses Go's `internal/domain/search.go` for punctuation-agnostic fuzzy search, and calls an optional LLM via `internal/llm/llm.go` from `POST /api/upc/classify`. Currently, `handleUPCClassify` passes only the household's `categories` list to the LLM, `ScannerDrawer.tsx` flips straight into `creatingNew = true` on OpenFoodFacts responses, `products.name` has no duplicate check, and `ProductsPage.tsx` exposes desktop bulk checkboxes only for `Merge` and `Delete`.

Existing databases may already contain exact case-insensitive duplicate product names (e.g., two products with the same normalized name), so duplicate prevention must not break existing databases with a failing `UNIQUE` index migration.

## Goals / Non-Goals

**Goals:**
- Standardize LLM product naming around the comma-inverted `Item, Variety, Detail` convention while eliminating broad catalog-category prefixes (`Meat,`, `Produce,`, `Bakery,`, `Beverage,`).
- Make LLM classification aware of the household's existing products and naming prefixes so scanning a new brand of an existing item reuses the existing product rather than creating a near-duplicate.
- Make the Purchase scanner match-first when the LLM finds an existing product, and provide search/similar-product nudges during manual creation.
- Prevent new exact case-insensitive duplicate product names at the API boundary without breaking legacy databases.
- Enable bulk name-only reclassification on `ProductsPage` with an editable review/exclude modal, live rename/merge preview, and atomic apply reusing existing product merge semantics.

**Non-Goals:**
- Splitting `Product.name` into structured database columns (`base_item`, `variety`, `detail`).
- Adding a SQLite `UNIQUE` index on `products.name`.
- Bulk-reclassifying product categories, measurements, or variant names (Bulk Reclassify is strictly name-only + merge).
- Exposing Bulk Reclassify on mobile viewports or search views (matches desktop-only Merge/Delete bulk bar).

## Decisions

### 1. Catalog-Aware Context for LLM Classification
- **Decision**: Before calling the LLM in `handleUPCClassify` (and in bulk reclassification), compute two lightweight slices from the household's `products` table:
  1. **Top candidate existing products** (up to 20 `{id, name}` pairs): gathered by running `domain.MatchProductSearch` (and individual word/trigram matching) against all products using the OpenFoodFacts `title` and `description` (or current product name + variant names in bulk mode).
  2. **Common catalog prefixes** (up to 30 most frequent leading comma-delimited prefixes, e.g., `Apples`, `Beans`, `Cheese`, `Chicken`, `Pasta`, `Sauce`, excluding broad taxonomy words that match top-level category names).
- **Prompt contract**:
  - Replace `"Category, Specification, Detail"` with explicit `"Item"`, `"Item, Variety"`, or `"Item, Variety, Detail"` instructions.
  - Explicitly forbid broad taxonomy prefixes (`Meat,`, `Produce,`, `Bakery,`, `Beverage,`, `Snack,`, `Prepared Foods,`) since `category_id` already captures category.
  - State plural for countable items (`Apples`, `Beans`, `Peppers`, `Chips`) and singular for uncountable/mass nouns (`Milk`, `Cheese`, `Chicken`, `Flour`, `Mustard`), with 4–5 concrete few-shot examples.
  - Instruct the LLM to return `matched_product_id` (an exact integer ID from the provided `existing_products` list) whenever an existing product already represents the same generic item, or `null` otherwise, while still returning a standardized `product_name` as fallback (used if the user clicks "Create new product instead").
- **Validation**: Strictly validate `matched_product_id` against the provided candidate IDs (setting it to `nil` if invalid), mirroring how `category_id` is validated today.
- **Alternatives considered**: Passing the entire catalog (~650+ products) to every prompt. Rejected to keep token usage, latency, and local-Ollama context size small as catalogs grow.

### 2. Exposing LLM Availability for UI Gating
- **Decision**: Expose `llm_enabled: bool` in `GET /api/auth/status` (or a lightweight non-admin field in auth/session status) so `ProductsPage` knows whether to render the `Reclassify` bulk action for any authenticated user without querying admin-only `GET /api/settings`.
- **Rationale**: `GET /api/settings` is admin-restricted, whereas `member` users can manage products and use the Purchase scanner and bulk actions.

### 3. API-Level Case-Insensitive Duplicate Product Name Guard
- **Decision**: In `handleCreateProduct`, `handleUpdateProduct`, and `handlePurchaseWorkflow` (when `new_product` is provided), check for an existing product with `LOWER(TRIM(name)) = LOWER(TRIM(?))` (excluding `id != ?` on update). If found, return `HTTP 409 Conflict` with JSON `{ "error": "...", "existing_product": { "id": ..., "name": ... } }`.
- **Rationale**: Prevents new exact duplicates immediately without requiring a destructive migration on databases that already contain historical duplicates.

### 4. Match-First Purchase Workflow & Live Similar-Product Nudges
- **Decision**:
  - Update `ScannerDrawer.tsx` to pass OpenFoodFacts `description` alongside `title` and `quantity` to `POST /api/upc/classify`.
  - When `classification.matched_product_id` is returned (and resolves to a product), do **not** default to `creatingNew = true`. Instead, auto-select that existing product into Confirm & Add, keep the scanned barcode and pre-filled `variant_name` / `variantMeasurement` attached for the new variant, and show a prominent banner (`Matched existing product: <Name>`) with a 1-click `"Create new product instead"` button that switches to the Create New form pre-filled with `classification.product_name`, `category_id`, and measurements.
  - When `matched_product_id` is `null` or LLM is disabled, allow the user to search/select an existing product (via an inline search input + fuzzy search hits) or create a new product.
  - Add a debounced (~250ms) `GET /api/products?status=all&q=<name>` similar-products lookup whenever typing a product name in `ProductFormPage.tsx` and the Scanner "Create New" form, showing up to 5 near-matches (clicking a match in Scanner switches to that existing product; in `ProductFormPage` it links to `/products/:id` and highlights exact case-insensitive matches).

### 5. Bulk Reclassify Architecture (Suggest + Atomic Apply)
- **Decision**: Split bulk reclassification into two endpoints so users can review, edit, and exclude before mutating data:
  1. `POST /api/products/reclassify/suggest` — accepts `{ "product_ids": [1, 2, ...] }` (bounded to e.g. 100 IDs per request; the frontend can chunk larger selections into batches of 10–15 to display live progress and avoid HTTP timeouts). For each product, loads its current name and variant names, builds catalog candidate/prefix context, calls the LLM (or batches 10–15 items per LLM call with per-item fallback if JSON parsing fails) to return `{ "suggestions": [{ "product_id", "current_name", "suggested_name", "error"? }] }`.
  2. `POST /api/products/reclassify/apply` — accepts `{ "items": [{ "product_id": 1, "new_name": "Apples, Gala" }, ...] }`.
- **Atomic Merge & Rename Resolution in `reclassify/apply`**:
  - Inside a single SQLite transaction:
    - Trim and validate all `new_name` values (reject blank names with `422`).
    - Group submitted items by `LOWER(TRIM(new_name))`.
    - For each target-name group:
      - Check whether an **unselected** existing product in `products` already has `LOWER(TRIM(name)) = targetKey`.
      - If yes, that unselected existing product is the **survivor** (keeps its existing name and metadata), and all submitted products in the group merge into it.
      - If no, choose the **survivor** from the submitted products in the group deterministically: highest `in_stock_count` (unconsumed items), tie-breaking by highest `variant_count`, then lowest `id`. Rename the survivor to the group's `new_name` and merge all other submitted products in the group into the survivor.
    - Reuse a shared internal `mergeProductsTx(ctx, tx, targetID, sourceIDs, now)` helper extracted from `handleMergeProducts` so variants, barcodes, items, chained merge aliases, and `product_merges` records behave identically to `POST /api/products/merge`.
    - Return `{ "renamed": N, "merged": M, "products": [...] }`.
- **Live Client-Side Preview**: Because `ProductsPage` can fetch/query the catalog (or use a lightweight `GET /api/products?status=all` list inside the modal), the Review modal computes the exact same grouping + survivor rules client-side on every keystroke or checkbox toggle, showing clear badges (`Rename`, `Merge into existing: <Name>`, `Merge into <Survivor>`, `No change`, or `Excluded`). Rows where `suggested_name` equals `current_name` (case-insensitive) default to unchecked.

## Risks / Trade-offs

- **LLM latency on large bulk selections** → Chunk `reclassify/suggest` calls on the frontend (e.g., 10 products per request) with a visible progress counter (`Classifying 10 / 45...`) and a Cancel button so large selections never hit HTTP timeouts.
- **LLM over-matching distinct products in Purchase mode** → Always display the `"Matched existing product"` banner with a 1-click `"Create new product instead"` button pre-populated with the LLM's suggested `product_name`, `category_id`, and measurements.
- **Case-insensitive duplicate check when editing an already-duplicated legacy product** → On `PATCH /api/products/:id`, only reject if another product (`id != editedID`) shares `LOWER(TRIM(new_name))`; if a user edits non-name metadata on one of two pre-existing duplicates without changing its name, allow saving if `LOWER(TRIM(new_name)) == LOWER(TRIM(existing.name))` so legacy products remain editable until merged.
- **Prompt adherence across smaller/local models (Ollama)** → Keep the candidate list compact (≤ 20 items) and prefix list short (≤ 30 items), use concrete few-shot examples, and strictly validate `matched_product_id` and `category_id` in Go before returning to clients.

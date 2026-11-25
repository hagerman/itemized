# Proposal

## Why

Product names in Itemized currently drift based on inconsistent LLM suggestions (such as redundant taxonomy prefixes like `Meat,` or `Produce,` and singular/plural splits), the Purchase scanner workflow defaults straight into creating a new product even when an equivalent product already exists, and there is no way to standardize and deduplicate existing product names in bulk. Tightening the naming convention, making LLM classification catalog-aware, preventing duplicate creation up front, and adding a bulk Reclassify action will keep the catalog consistent and reduce duplicate products.

## What Changes

- **Standardized, catalog-aware LLM product classification**: Tighten the LLM classification prompt to enforce the comma-inverted `Item, Variety, Detail` naming convention (without broad catalog-category prefixes like `Meat,`, `Produce,`, `Bakery,`, or `Beverage,`, using plural for countable items and singular for uncountable items). Pass OpenFoodFacts description alongside title/quantity, plus top candidate existing products and common catalog prefixes from the household's catalog, so the LLM can return a validated `matched_product_id` when an existing product already represents the item or generate a name aligned with existing conventions.
- **Match-first Purchase scanner workflow**: When scanning an unknown barcode in Purchase mode and the LLM returns a `matched_product_id`, automatically pre-select that existing product (with a banner and one-click `"Create new product instead"` toggle) to attach the new barcode/variant. When no match is returned or LLM is disabled, allow the user to search/select an existing product or create a new one, and surface live debounced similar-product matches as the user types a new product name.
- **Duplicate product guardrails**: Enforce case-insensitive exact-duplicate product name rejection (`HTTP 409 Conflict` with conflicting product info) on product creation and rename at the API level (without a breaking SQLite unique index migration), and display live debounced `"Similar existing products"` suggestions while typing a product name in the Product create/edit form and Scanner Purchase flow.
- **Bulk Reclassify workflow on Products list**: Add a `Reclassify` action to the desktop bulk-selection bar on the Products list (when an LLM provider is configured) that classifies selected products for name-only standardization, presents an editable review modal with per-row include/exclude checkboxes and live rename/merge previews, and atomically applies renames and merges in one transaction—reusing existing merge alias and reassignment logic when renamed products collide with each other or with an existing product.

## Capabilities

### New Capabilities

### Modified Capabilities
- `upc-and-classification`: Update LLM product classification to enforce the `Item, Variety, Detail` naming convention, incorporate OpenFoodFacts description and household catalog context (candidate existing products and common prefixes), return optional `matched_product_id`, and add bulk product name reclassification via the configured LLM.
- `inventory-catalog`: Add case-insensitive exact-duplicate product name conflict checking (`HTTP 409`) on product create/update, and add an atomic bulk reclassify-apply endpoint that renames products and merges colliding target names using existing merge-alias rules and deterministic survivor selection.
- `barcode-scanning`: Update the Purchase workflow to auto-select an LLM-returned `matched_product_id` (with a one-click `"Create new product instead"` option), let users search/select or create new when unmatched or LLM is disabled, and surface live similar-product suggestions while typing a new product name.
- `web-ui`: Add live similar-product suggestions and duplicate feedback on the Product create/edit form, and add the desktop `Reclassify` bulk action and review/edit/merge-preview modal to the Products list (including modal backdrop dismissal).

## Impact

- **Backend (Go)**: `internal/llm/llm.go` (prompt, candidate/prefix context, `matched_product_id`, bulk name reclassification), `internal/api/workflows.go` (`handleUPCClassify` passing description + catalog candidates/prefixes), `internal/api/catalog.go` (duplicate name check on create/update, bulk reclassify suggest & apply endpoints, shared merge helper), `internal/api/server.go` (route registration and exposing `llm_enabled` status for UI gating).
- **Frontend (React)**: `web/src/components/ScannerDrawer.tsx` (match-first Purchase UX, `"Create new instead"`, search/create fallback, live similar-product matches), `web/src/pages/ProductFormPage.tsx` (live similar-product matches, naming hint, 409 duplicate handling), `web/src/pages/ProductsPage.tsx` (desktop `Reclassify` bulk action + review/edit/merge-preview modal).
- **Tests**: Go unit/API tests (`internal/llm/llm_test.go`, `internal/api/api_test.go`) and Vitest UI tests (`web/src/components/Scanner.test.tsx`, `web/src/pages/ProductFormPage.test.tsx`, `web/src/pages/ProductsPage.test.tsx`).

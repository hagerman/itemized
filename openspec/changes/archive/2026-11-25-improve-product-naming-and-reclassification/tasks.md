# Tasks

## 1. Catalog-Aware LLM Classification & Bulk Suggestion Backend

- [x] 1.1 Update `internal/llm/llm.go` to enforce the `Item, Variety, Detail` naming convention (explicitly forbidding broad taxonomy prefixes like `Meat,`, `Produce,`, `Bakery,`, `Beverage,`, preferring plural for countable items and singular for uncountable items, with few-shot examples), accept optional OpenFoodFacts `description`, `existing_products` candidates, and `common_prefixes`, and parse/validate `matched_product_id` against provided candidates; verify with unit tests in `internal/llm/llm_test.go` (`go test ./internal/llm/...`).
- [x] 1.2 Add bulk name-only reclassification support (`ReclassifyNames`) in `internal/llm/llm.go` that accepts a batch of products (id, current name, variant names) plus catalog context and returns suggested standardized names with resilient JSON parsing/fallback; verify with unit tests in `internal/llm/llm_test.go` (`go test ./internal/llm/...`).
- [x] 1.3 Update `POST /api/upc/classify` in `internal/api/workflows.go` to accept optional `description`, compute top candidate existing products (via `domain.MatchProductSearch`) and common catalog prefixes, pass them to `s.LLM.Classify`, and return `matched_product_id` (plus matched product summary if present); verify with API tests in `internal/api/api_test.go` (`go test ./internal/api/...`).
- [x] 1.4 Expose `llm_enabled` in `GET /api/auth/status` in `internal/api/auth.go` (or session status handler) so any authenticated user's UI can gate LLM-only controls without calling admin-only `/api/settings`; verify with API tests in `internal/api/api_test.go` (`go test ./internal/api/...`).

## 2. Duplicate Name Guard & Atomic Bulk Reclassify Apply API

- [x] 2.1 Add case-insensitive trimmed duplicate product name validation (`HTTP 409 Conflict` with `existing_product: { id, name }`) in `handleCreateProduct`, `handleUpdateProduct` (allowing non-name edits when `LOWER(TRIM(new_name)) == LOWER(TRIM(existing.name))`), and `handlePurchaseWorkflow` (`new_product`); verify with API tests in `internal/api/api_test.go` covering create conflict, rename conflict, and legacy-duplicate metadata edit (`go test ./internal/api/...`).
- [x] 2.2 Extract shared `mergeProductsTx` helper from `handleMergeProducts` in `internal/api/catalog.go` and implement `POST /api/products/reclassify/suggest` and `POST /api/products/reclassify/apply` (registered in `internal/api/server.go`), where `apply` atomically renames non-colliding products and merges colliding target names into unselected existing products first or deterministic batch survivors (most in-stock items → most variants → lowest ID); verify with API tests in `internal/api/api_test.go` (`go test ./internal/api/...`).

## 3. Match-First Purchase Scanner & Product Form Similar-Match Guardrails

- [x] 3.1 Update `web/src/components/ScannerDrawer.tsx` to send `description` to `/api/upc/classify`, auto-select the matched existing product when `matched_product_id` is returned (showing a matched-product banner with a 1-click `"Create new product instead"` toggle while preserving scanned barcode and variant details), let users search/select or create new when unmatched or LLM is disabled, and display live debounced similar-product matches while typing a new product name; verify with Vitest tests in `web/src/components/Scanner.test.tsx` (`npm test` in `web/`).
- [x] 3.2 Update `web/src/pages/ProductFormPage.tsx` to add a concise `Item, Variety, Detail` naming hint, display a live debounced `"Similar existing products"` list (excluding the currently edited product) with links and exact-match highlighting, and render `409 Conflict` duplicate errors inline with a link to the conflicting product; verify with Vitest tests in `web/src/pages/ProductFormPage.test.tsx` (`npm test` in `web/`).

## 4. Bulk Reclassify UI on Products List

- [x] 4.1 Update `web/src/pages/ProductsPage.tsx` to display a desktop-only `Reclassify` button in the floating bulk actions bar when 1+ products are selected and `llm_enabled` is true, and build the `Reclassify Products` modal (wrapped in `ModalBackdrop`) that chunks `POST /api/products/reclassify/suggest` calls with progress, renders editable target-name inputs and per-row include/exclude checkboxes (defaulting unchanged rows to unchecked), computes live rename/merge preview badges matching backend survivor rules, and applies included changes via `POST /api/products/reclassify/apply`; verify with Vitest tests in `web/src/pages/ProductsPage.test.tsx` (`npm test` in `web/`).

## 5. End-to-End Verification

- [x] 5.1 Run full Go verification (`go test ./...`, `go vet ./...`, and `gopls check` on modified Go files) and frontend verification (`npm test` and `npm run build` in `web/`), ensuring zero failures or diagnostics.

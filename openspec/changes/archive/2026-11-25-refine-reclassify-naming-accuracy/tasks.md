# Tasks

## 1. LLM Naming Prompt & Bulk Reclassification Input

- [x] 1.1 Update `namingConventionRules` and `ReclassifyInput` (adding `CategoryName`) in `internal/llm/llm.go` to explicitly distinguish store-department prefixes to strip (`Meat,`, `Produce,`, `Bakery,`, `Beverage,`, `Snack,`, `Prepared Foods,`, `Canned,`, `Frozen,`) from dish/product-type nouns to preserve (`Soup,`, `Salad,`, `Sauce,`, `Stew,`, `Chili,`, `Broth,`, `Juice,`, `Soda,`), forbid changing the fundamental product type, and add `"Soup, Italian Bean" -> "Soup, Italian Bean"` to the examples; verify with unit tests in `internal/llm/llm_test.go` (`go test ./internal/llm/...`).

## 2. Prefix-Aware Catalog Context & Category Context in Reclassify Suggest

- [x] 2.1 Update `loadCatalogNamingContext` in `internal/api/catalog.go` to always include existing non-department catalog prefixes matching the input's leading prefix in `common_prefixes` (even outside the global top 30) and to weight leading-prefix matches above secondary modifier matches when ranking `existing_products` candidates; verify with unit/API tests in `internal/api/api_test.go` (`go test ./internal/api/...`).
- [x] 2.2 Update `handleReclassifySuggest` in `internal/api/catalog.go` to populate `CategoryName` on `llm.ReclassifyInput` from `listAllCategories` and omit redundant variant names equal to `current_name` (case-insensitively); verify with API tests in `internal/api/api_test.go` (`go test ./internal/api/...`).

## 3. Verification

- [x] 3.1 Run `go test ./...`, `go vet ./...`, and `gopls check` on modified Go files, ensuring zero failures or diagnostics.

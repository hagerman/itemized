# Proposal

## Why

During bulk product name reclassification, the LLM can misclassify valid dish/product-type prefixes like `Soup, Italian Bean` into an ingredient prefix like `Beans, Italian` because global top-30 prefix sampling drops smaller valid prefixes (`Soup`), candidate scoring lets secondary modifier words (`Bean`) outvote the leading noun (`Soup`), and the prompt does not clearly separate store-department prefixes (`Meat,`, `Produce,`) from dish/product-type nouns (`Soup,`, `Salad,`, `Sauce,`). Refining the prompt rules and making catalog context prefix-aware and category-aware will prevent semantic misclassifications during both UPC classification and bulk reclassification.

## What Changes

- **Preserve dish/product-type nouns in LLM naming rules**: Clarify the shared naming prompt to distinguish store-department prefixes to strip (`Meat,`, `Produce,`, `Bakery,`, `Beverage,`, `Snack,`, `Prepared Foods,`, `Canned,`, `Frozen,`) from actual dish/product-type nouns to preserve (`Soup,`, `Salad,`, `Sauce,`, `Stew,`, `Chili,`, `Broth,`, `Juice,`, `Soda,`), explicitly forbid changing the fundamental product type (e.g., turning a Soup into Beans or a Sauce into Tomatoes), and include concrete preservation examples (`"Soup, Italian Bean" -> "Soup, Italian Bean"`).
- **Prefix-aware catalog context & candidate ranking**: Always include any existing catalog prefix matching the input's leading prefix in `common_prefixes` (even if it falls outside the global top 30), and weight leading-prefix matches higher than secondary modifier matches when selecting top `existing_products` candidates.
- **Category context and cleaner variant names on bulk reclassification**: Pass each product's `category_name` as read-only context in `ReclassifyInput` and omit redundant variant names that merely duplicate `current_name` case-insensitively.

## Capabilities

### New Capabilities

### Modified Capabilities
- `upc-and-classification`: Update LLM product classification and bulk product name reclassification requirements to preserve dish/product-type nouns, ensure prefix-aware catalog context selection, and pass product category context (with deduplicated variant names) during bulk reclassification.

## Impact

- **Backend (Go)**: `internal/llm/llm.go` (`namingConventionRules`, `ReclassifyInput.CategoryName`, `buildReclassifyPrompt`), `internal/api/catalog.go` (`loadCatalogNamingContext`, `handleReclassifySuggest`).
- **Tests**: `internal/llm/llm_test.go`, `internal/api/api_test.go`.

# Design

## Context

See `proposal.md` for motivation. In `internal/api/catalog.go`, `loadCatalogNamingContext` currently computes `common_prefixes` as the global top 30 comma-delimited prefixes by frequency and scores `existing_products` candidates using equal word weights across all tokens. In `internal/llm/llm.go`, `namingConventionRules` forbids broad category prefixes without explicitly distinguishing store departments (`Meat,`, `Produce,`) from dish/product-type nouns (`Soup,`, `Salad,`, `Sauce,`). As a result, a product like `"Soup, Italian Bean"` (whose `"Soup"` prefix has only 3 products and misses the top-30 cutoff, while `"Beans"` has 8 products) can be misclassified as `"Beans, Italian"`.

## Goals / Non-Goals

**Goals:**
- Prevent the LLM from stripping or replacing a product's actual dish/product-type noun (`Soup`, `Salad`, `Sauce`, `Stew`, `Chili`, `Broth`, `Juice`, `Soda`, etc.).
- Ensure `common_prefixes` always includes any existing non-department catalog prefix that matches an input's leading prefix, regardless of global frequency rank.
- Rank candidate existing products whose leading prefix matches the input's leading prefix above products matching only secondary modifier words.
- Provide `category_name` as read-only context on `ReclassifyInput` and suppress redundant variant names that merely duplicate `current_name`.

**Non-Goals:**
- Changing the `POST /api/products/reclassify/suggest` or `POST /api/products/reclassify/apply` HTTP schemas or frontend UI.
- Allowing bulk reclassification to mutate `category_id`.

## Decisions

### 1. Explicit Dish/Product-Type Preservation in `namingConventionRules`
- **Decision**: Update `namingConventionRules` in `internal/llm/llm.go` to:
  - Distinguish **store-department prefixes to strip** (`Meat,`, `Produce,`, `Bakery,`, `Beverage,`, `Snack,`, `Prepared Foods,`, `Canned,`, `Frozen,`) from **dish/product-type nouns to keep** (`Soup,`, `Salad,`, `Sauce,`, `Stew,`, `Chili,`, `Broth,`, `Juice,`, `Soda,`).
  - Explicitly forbid changing the fundamental product type (e.g., never turn a `Soup` into `Beans`, a `Sauce` into `Tomatoes`, or a `Salad` into `Pasta`).
  - Add `"Soup, Italian Bean" -> "Soup, Italian Bean"` to the few-shot examples.

### 2. Prefix-Aware `common_prefixes` and Candidate Scoring
- **Decision**: In `loadCatalogNamingContext` (`internal/api/catalog.go`):
  - Extract any leading comma-delimited prefixes from `queries` (e.g., `"soup"` from `"Soup, Italian Bean"`).
  - When building `common_prefixes`, prepend (or guarantee inclusion of) any existing non-department catalog prefix that matches one of the query leading prefixes (even if its count is < top 30), while keeping the list capped around 30–35 entries.
  - When scoring `existing_products` candidates, add a strong bonus (e.g., `+30.0`) when a candidate's leading prefix matches a query's leading prefix (case-insensitive / singular-plural prefix match), so other `Soup, ...` products outrank `Beans, ...` products when classifying `"Soup, Italian Bean"`.

### 3. Category Context & Redundant Variant Filtering on Bulk Reclassify
- **Decision**: Add `CategoryName string` (`json:"category_name,omitempty"`) to `llm.ReclassifyInput`, populate it in `handleReclassifySuggest` via `s.listAllCategories` (using `HierarchyName`), and filter out any variant name where `strings.EqualFold(vName, currentName)` (in addition to `"Default"` / `"Default Variant"`).

## Risks / Trade-offs

- **Slightly longer prompt** → Adding 2 lines of preservation rules and `category_name` adds negligible tokens (~50–80 tokens) while substantially reducing destructive semantic rewrites.

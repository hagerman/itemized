# Spec Delta: upc-and-classification

## MODIFIED Requirements

### Requirement: Opt-in LLM product classification
LLM product classification SHALL be disabled by default and SHALL not be required to run the application. When configured with a provider (`anthropic`, `openai`, `gemini`, or `openai-compatible` with custom base URL such as Ollama), model name, and optional API key, the system SHALL normalize a raw UPC title, optional description, and quantity into a standardized generic product name following the comma-inverted `Item`, `Item, Variety`, or `Item, Variety, Detail` convention (omitting brands, sizes, packaging, and broad store-department prefixes such as `Meat,`, `Produce,`, `Bakery,`, `Beverage,`, `Snack,`, `Prepared Foods,`, `Canned,`, or `Frozen,` while preserving actual dish or product-type nouns such as `Soup,`, `Salad,`, `Sauce,`, `Stew,`, `Broth,`, `Juice,`, or `Soda,` and never changing the fundamental product type; preferring plural for countable items and singular for uncountable items), a structured measurement (`value`, `unit_type`, `unit`), an optional matching `category_id` from the household's existing categories, and an optional `matched_product_id` from the household's existing catalog. The classification request to the LLM SHALL include relevant candidate existing products (prioritizing leading-prefix matches over secondary modifier matches) and common naming prefixes from the household's catalog (always including any existing non-department prefix matching the input's leading prefix) so the LLM can match an existing generic product or align new names with established catalog prefixes. Any returned `matched_product_id` SHALL be strictly validated against the household's existing products (falling back to `null` if invalid). For the `gemini` provider, the system SHALL send the API key in the `x-goog-api-key` HTTP request header rather than a URL query parameter, and classification failure warnings returned to API clients SHALL be sanitized so raw upstream URLs, credentials, or response bodies are not exposed.

#### Scenario: Purchase flow works when LLM is unconfigured
- **WHEN** no LLM provider is configured and a user scans an unknown barcode
- **THEN** the system skips LLM classification without error and presents the raw OpenFoodFacts title for manual product selection or creation

#### Scenario: LLM classification returns structured suggestion
- **WHEN** an LLM provider is configured, no existing product matches, and classification succeeds
- **THEN** the system returns a standardized `Item, Variety, Detail` product name, `matched_product_id: null`, optional measurement, and a `category_id` that is either `null` or an exact existing category ID

#### Scenario: LLM classification matches an existing household product
- **WHEN** an LLM provider is configured and the scanned OpenFoodFacts title/description corresponds to an existing product passed in the catalog candidate context (e.g., `"Mustard, Dijon"`)
- **THEN** the system returns `matched_product_id` set to that existing product's exact ID alongside a standardized fallback `product_name`, optional measurement, and optional `category_id`

#### Scenario: Invalid matched_product_id from LLM is discarded
- **WHEN** the LLM returns a `matched_product_id` that does not exist in the provided catalog candidates
- **THEN** the system sets `matched_product_id` to `null` instead of returning an invalid product reference

#### Scenario: Gemini request authenticates via header and sanitizes errors
- **WHEN** `llm_provider` is `gemini` and a classification request is sent
- **THEN** the outbound HTTP request includes `x-goog-api-key` with no `key=` query parameter in the URL
- **AND** if the upstream request fails, the API returns a generic warning without leaking the API key or raw transport URL

### Requirement: Bulk LLM product name reclassification
When an LLM provider is configured, `POST /api/products/reclassify/suggest` SHALL accept a non-empty list of `product_ids` and return a name-only standardized `Item, Variety, Detail` suggestion per product using its current name, category name, non-redundant variant names, and prefix-aware household catalog context without mutating records or changing the fundamental product type. When no LLM provider is configured, the endpoint SHALL reject the request.

#### Scenario: Generating standardized name suggestions for selected products
- **WHEN** an authenticated user sends `POST /api/products/reclassify/suggest` with a list of existing `product_ids` while an LLM provider is configured
- **THEN** the system returns HTTP 200 with a suggestion entry per requested product containing `product_id`, `current_name`, and `suggested_name` (or a sanitized per-item error if classification failed), leaving all stored products unchanged

#### Scenario: Prefix-aware catalog context and category context preserve dish types during bulk reclassification
- **WHEN** a product named `"Soup, Italian Bean"` (in category `"Canned Goods & Soups"`) is reclassified while `"Soup"` has fewer products than the global top-30 prefixes and many `"Beans, ..."` products exist
- **THEN** the LLM prompt includes `"Soup"` in `common_prefixes`, prioritizes other `"Soup, ..."` products in `existing_products` ahead of `"Beans, ..."`, includes the product's category name, omits redundant variant names identical to the product name, and instructs the LLM not to change the fundamental product type

#### Scenario: Rejecting bulk reclassification when LLM is disabled
- **WHEN** an authenticated user sends `POST /api/products/reclassify/suggest` while no LLM provider is configured
- **THEN** the system rejects the request with HTTP 400 Bad Request (or HTTP 422 Unprocessable Entity) indicating that LLM classification is not configured

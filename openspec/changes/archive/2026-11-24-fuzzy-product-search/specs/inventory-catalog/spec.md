# Spec Delta

## MODIFIED Requirements

### Requirement: Fuzzy product search
The system SHALL support case-insensitive fuzzy and multi-word search on `GET /api/products?q=...`. Text queries SHALL strip punctuation, match via trigram similarity (`>= 0.3`), per-word typo similarity (`>= 0.4` for 3+ char tokens), or all-keyword substrings in any order, return empty if punctuation-only, and sort by tier (exact → prefix → whole-word → substring → fuzzy), similarity desc, then name asc (unless `sort=due_date`/`stock`). Numeric 8–14 digit queries SHALL check barcodes first.

#### Scenario: Partial substring product search
- **WHEN** a user searches for a partial product name (e.g., `"cash"` for `"Nuts, Cashews, Whole"`)
- **THEN** the system returns matching products including `"Nuts, Cashews, Whole"`

#### Scenario: Reordered words and omitted punctuation
- **WHEN** a product named `"Chicken, Popcorn, Fried"` exists and a user searches for `"Fried Chicken Popcorn"`
- **THEN** the system returns `"Chicken, Popcorn, Fried"`

#### Scenario: Query with extra descriptive words
- **WHEN** a product named `"Chicken, Popcorn, Fried"` exists and a user searches for `"Chicken, Popcorn, Fried, Original"`
- **THEN** the system returns `"Chicken, Popcorn, Fried"` via trigram similarity

#### Scenario: Multi-word order-independent keyword match
- **WHEN** a product named `"Nuts, Cashews, Whole"` exists and a user searches for `"whole nuts"`
- **THEN** the system returns `"Nuts, Cashews, Whole"`

#### Scenario: Typo tolerance via trigram similarity
- **WHEN** products `"Cashews"` and `"Chicken, Popcorn, Fried"` exist and a user searches for `"Cashewz"` or `"chiken"`
- **THEN** `"Cashewz"` returns `"Cashews"` and `"chiken"` returns `"Chicken, Popcorn, Fried"`

#### Scenario: Tiered relevance ordering
- **WHEN** products `"Milk"`, `"Milk, Whole"`, `"Almond Milk, Unsweetened"`, and `"Buttermilk"` exist and a user searches for `"Milk"`
- **THEN** results are ordered `"Milk"` (exact), `"Milk, Whole"` (prefix), `"Almond Milk, Unsweetened"` (whole word), `"Buttermilk"` (substring)

#### Scenario: Punctuation-only query returns no results
- **WHEN** a user searches for `",,,---"`
- **THEN** the system returns an empty product list

#### Scenario: Barcode query matches associated product
- **WHEN** a product has a variant with barcode `"012345678905"` and a user searches `GET /api/products?q=0012345678905` (13-digit EAN-13 with leading zero) or `q=012345678905`
- **THEN** the system returns that product

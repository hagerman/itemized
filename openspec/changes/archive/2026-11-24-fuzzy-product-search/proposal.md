# Proposal

## Why

Product search in `GET /api/products?q=...` currently relies on SQLite FTS5 trigram phrase matching (`products_fts MATCH '"<q>"'`), which only matches exact contiguous substrings. As a result, queries with reordered words (e.g. `"Fried Chicken Popcorn"` for `"Chicken, Popcorn, Fried"`), extra details (e.g. LLM-classified purchase suggestions like `"Chicken, Popcorn, Fried, Original"`), punctuation differences, or minor typos return zero results—regressing from the legacy Rails/PostgreSQL `pg_trgm` fuzzy search experience.

## What Changes

- Replace the exact-substring FTS5 phrase query in `GET /api/products?q=...` with a `pg_trgm`-compatible fuzzy search matcher in Go that mirrors the legacy Rails `ProductsController#search` behavior:
  - Strip punctuation from text queries (`[^\w\s\d]`-equivalent normalization) before matching.
  - Match products when **either** full-string trigram similarity meets the `pg_trgm` default threshold (`>= 0.3`), all whitespace-separated query keywords appear as case-insensitive substrings (in any word order), **or** every query keyword matches as a substring or (for 3+ character tokens) via per-word trigram similarity (`>= 0.4`) against a word in the product name.
  - Rank matching products by relevance tier (exact normalized match → prefix match → all whole-word matches → all substring matches → fuzzy trigram matches), breaking ties by trigram similarity descending and then product name (case-insensitive ascending), while still honoring explicit `sort=due_date` and `sort=stock` overrides.
  - Preserve short-query (`< 3` characters) substring matching and punctuation-only query handling (returning empty results when a non-empty query strips down to blank).
- Support 8–14 digit barcode queries on `GET /api/products?q=...` (including EAN-13 leading-zero normalization to 12-digit UPC-A), matching associated products by variant barcode before falling back to product name search, matching legacy `ProductsController#search`.

## Capabilities

### New Capabilities

### Modified Capabilities
- `inventory-catalog`: Expand `Fuzzy product search` requirement to specify `pg_trgm`-compatible trigram similarity matching, punctuation-normalized order-independent multi-word keyword matching, relevance ranking by similarity, and 8–14 digit barcode query matching.

## Impact

- **Backend**:
  - `internal/domain/`: New `pg_trgm`-compatible trigram extraction, Jaccard similarity, query normalization, and product name matching helpers with unit tests.
  - `internal/api/catalog.go`: Update `loadProducts` to evaluate fuzzy matching, barcode lookup for 8–14 digit queries, and similarity-desc ordering.
  - `internal/api/api_test.go`: Add API tests covering reordered words, extra details, typos, punctuation differences, multi-word AND matching, similarity ranking, and barcode search queries.
- **Database / Migrations**: No schema migration required; existing `products_fts` table and triggers remain intact without destructive changes.
- **Frontend**: No UI changes required; `SearchPage`, `ProductsPage`, and `ScannerDrawer` all query `GET /api/products?q=...` and automatically benefit from improved fuzzy search and ranking.

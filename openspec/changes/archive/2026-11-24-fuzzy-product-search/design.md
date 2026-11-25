# Design

## Context

See [proposal.md](proposal.md) for motivation. Currently, `loadProducts` in `internal/api/catalog.go` executes `products_fts MATCH '"<q>"'` for queries with `len(q) >= 3` and `p.name LIKE '%<q>%'` for shorter queries. Because SQLite FTS5's `trigram` tokenizer with a quoted phrase requires an exact contiguous substring match, it cannot match reordered words, extra descriptive words, punctuation mismatches, or typos.

In the legacy Rails application (`legacy/itemized/app/controllers/products_controller.rb`), `ProductsController#search` used PostgreSQL's `pg_trgm` extension:
1. If `q` is 8–14 digits, look up matching products via variant barcodes (checking both `q` and `q[1:]` when `q` is 13 digits starting with `0`), falling back to `LOWER(name) LIKE '%q%'`.
2. Otherwise, strip non-word/non-space/non-digit characters (`clean_q`), split into lowercase keywords, and match `products.name % clean_q OR (LOWER(products.name) LIKE '%kw1%' AND ...)`, ordered by `similarity(products.name, clean_q) DESC, name ASC`.

This Go backend uses pure-Go `modernc.org/sqlite` without CGo or PostgreSQL. `loadProducts` already hydrates matching products and aggregates all unconsumed item stats in Go memory.

## Goals / Non-Goals

**Goals:**
- Reproduce legacy `pg_trgm` fuzzy search matching and ranking behavior in pure Go without adding external dependencies or CGo.
- Apply the improved search uniformly across all callers of `GET /api/products?q=...` (`SearchPage`, `ProductsPage`, and `ScannerDrawer`).
- Maintain backward compatibility with existing status, category, location, and explicit sort (`due_date`, `stock`) filters.
- Preserve existing database schema and `products_fts` tests without destructive migrations.

**Non-Goals:**
- Replacing SQLite or adding native C extensions.
- Dropping the existing `products_fts` virtual table or its triggers.
- Changing frontend search UI, query debouncing, or result rendering.
- Adding fuzzy search to `/api/locations` or `/api/categories` (legacy only used `pg_trgm` on products).

## Decisions

### 1. Pure-Go `pg_trgm`-compatible trigram similarity in `internal/domain`

Implement trigram extraction and similarity scoring directly in `internal/domain/search.go`:
- **Word extraction**: Lowercase the string and extract contiguous runs of Unicode letters and digits (`unicode.IsLetter(r) || unicode.IsDigit(r)`), matching PostgreSQL `pg_trgm`'s word-splitting rules where punctuation and whitespace separate words.
- **Padded trigrams**: For each word, pad with two leading spaces and one trailing space (`"  " + word + " "`), then extract every 3-rune sliding window into a deduplicated set (`map[string]struct{}`).
- **Jaccard similarity**: `similarity(a, b) = float64(|trigrams(a) ∩ trigrams(b)|) / float64(|trigrams(a) ∪ trigrams(b)|)` (returning `0` when the union is empty).
- **Threshold**: Default `TrigramSimilarityThreshold = 0.3`, matching PostgreSQL `pg_trgm.similarity_threshold`.

**Alternatives considered:**
- *SQLite FTS5 OR-trigram query rewriting*: Generating OR clauses of trigrams in FTS5 does not compute Jaccard similarity (BM25 weights by IDF rather than trigram overlap ratio), cannot cleanly handle `<3` character tokens, and requires complex escaping.
- *Custom SQLite scalar UDF via `modernc.org/sqlite`*: Still executes a full table scan on `products` while coupling domain logic to driver registration. Computing in Go inside `loadProducts` is simpler, faster to unit-test in isolation, and avoids driver-specific glue.

### 2. Combined matching and tiered ranking rule

Extend legacy `ProductsController#search` with tiered relevance ranking and per-word typo matching:
- **Normalize**: Strip characters other than letters, digits, underscores, and whitespace (`cleanQ`), then trim. If trimmed raw `q != ""` and `cleanQ == ""`, return an empty slice immediately.
- **Match condition**: A product matches if any of the following hold:
  - All whitespace-separated lowercase keywords of `cleanQ` appear in `strings.ToLower(product.Name)` (in any order).
  - `TrigramSimilarity(product.Name, cleanQ) >= 0.3` (full-string `pg_trgm` match).
  - Every query keyword matches either as a substring or (for keywords of 3+ runes) via per-word trigram similarity `>= 0.4` against at least one alphanumeric word in `product.Name` (enabling single-word typos like `"chiken"` against multi-word names like `"Chicken, Popcorn, Fried"`).
- **Tiered ordering**: Sort matching products by:
  1. Relevance tier descending: `Exact` (5) > `Prefix` (4) > `WholeWord` (3) > `Substring` (2) > `Fuzzy` (1).
  2. `TrigramSimilarity(product.Name, cleanQ)` descending.
  3. `strings.ToLower(product.Name)` ascending.
- **Interaction with `sort` param**: `handleListProducts` only re-sorts when `sort` is `"due_date"` or `"stock"`. When `sort` is omitted or `"name"`, the relevance order returned by `loadProducts` is preserved (while empty `q` still returns products ordered alphabetically by `name COLLATE NOCASE ASC`).

### 3. Barcode query detection on `GET /api/products?q=...`

When trimmed `q` matches `^\d{8,14}$`:
- Build candidate list `[q]` plus `q[1:]` if `len(q) == 13 && q[0] == '0'`.
- Query distinct `v.product_id` from `barcodes b JOIN variants v ON v.id = b.variant_id WHERE b.barcode IN (...)`.
- If one or more product IDs match, return only those products (ordered by name).
- If no barcode matches, fall back to case-insensitive substring matching on `p.name LIKE '%q%'` (matching legacy behavior).

### 4. Retain `products_fts` without destructive migration

Keep `products_fts` and its triggers intact in `001_initial.sql`. No migration is needed, `internal/db/db_test.go` continues to pass unchanged, and the change is trivially reversible.

## Risks / Trade-offs

- **[In-memory scan of all products on text search]** → For a single-household inventory (typically 50–5,000 products), loading `products` rows and scoring trigrams in Go takes a few milliseconds and is negligible compared to the existing full-table unconsumed `items` aggregation in `loadProducts`. If scale ever grows significantly, trigram sets can be cached or pre-filtered.
- **[Per-word typo threshold tuning (0.4 for 3+ rune tokens)]** → Requiring 3+ runes prevents 1–2 character tokens from spuriously fuzzy-matching unrelated words, while `0.4` catches common single-character typos (`"chiken"` → `"chicken"` at `0.50`, `"cashewz"` → `"cashews"` at `0.60`) without matching unrelated words (`"apple"` vs `"maple"` at `0.20`).
- **[Punctuation-only queries returning empty]** → Matches legacy `scope = scope.none` and prevents `"..."` or `","` from matching every product in the catalog.

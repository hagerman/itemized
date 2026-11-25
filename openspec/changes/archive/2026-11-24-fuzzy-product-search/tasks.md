# Tasks

## 1. Domain Fuzzy Search Matcher

- [x] 1.1 Create `internal/domain/search.go` implementing `pg_trgm`-compatible trigram extraction, `TrigramSimilarity` (padded word trigrams + Jaccard similarity, threshold `0.3`), query normalization (`NormalizeSearchQuery`), `IsBarcodeQuery` / `BarcodeCandidates` (8–14 digits with 13-digit leading-zero EAN-13 to UPC-A normalization), and `MatchProductSearch` (tiered Exact/Prefix/WholeWord/Substring/Fuzzy matching plus per-word typo similarity `>= 0.4` for 3+ rune tokens), verified by compiling `go test ./internal/domain/...`
- [x] 1.2 Add unit tests in `internal/domain/search_test.go` covering partial substrings (`"cash"` → `"Nuts, Cashews, Whole"`), reordered words (`"Fried Chicken Popcorn"` → `"Chicken, Popcorn, Fried"`), extra descriptive words (`"Chicken, Popcorn, Fried, Original"` → `"Chicken, Popcorn, Fried"`), multi-word order-independent keywords (`"whole nuts"`), typos (`"Cashewz"` → `"Cashews"`, `"chiken"` → `"Chicken, Popcorn, Fried"`), tiered relevance ordering, punctuation-only queries, and 8–14 digit barcode candidate generation; verify with `go test -v ./internal/domain/...`

## 2. Catalog API Integration

- [x] 2.1 Update `loadProducts` in `internal/api/catalog.go` to handle 8–14 digit barcode lookup via `barcodes` joined with `variants` (falling back to case-insensitive name substring when no barcode matches) and replace the FTS5 phrase match with the `domain` fuzzy search matcher, sorting matches by relevance tier descending, similarity descending, then case-insensitive name ascending while preserving explicit `due_date` and `stock` sort overrides in `handleListProducts`; verify with `go test ./internal/api/...`
- [x] 2.2 Add API integration tests in `internal/api/api_test.go` covering `GET /api/products?q=...` for reordered words, extra details, single- and multi-word typos, multi-word keywords, tiered relevance ordering (`Exact > Prefix > WholeWord > Substring`), punctuation-only queries returning empty, explicit `sort=due_date`/`sort=stock` overrides, and 12-/13-digit barcode queries; verify with `go test -v ./internal/api/...`

## 3. Verification

- [x] 3.1 Run `go test ./...`, `go vet ./...`, and `gopls check` on modified/all Go files and confirm all tests pass with zero warnings or diagnostics

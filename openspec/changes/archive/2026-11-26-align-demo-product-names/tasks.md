# Tasks

## 1. Update Demo Seed Product Names

- [x] 1.1 Update the 14 seeded product names (and corresponding inline comments) in `internal/demo/seed.go` to match the LLM `Item` / `Item, Variety` / `Item, Variety, Detail` convention (`Milk, Whole`, `Spinach, Baby`, `Yogurt, Greek`, `Stock, Chicken`, `Salsa, Fresh`, `Pasta, Whole Grain`, `Oil, Olive, Extra Virgin`, `Beans, Black`, `Berries, Mixed`, `Beef, Ground`, `Paper Towels`, `Water, Sparkling`, `Coffee, Whole Bean`, `Soap, Dish`), keeping variants, barcodes, categories, locations, measurements, and relative dates unchanged; verify `go test ./internal/demo/...` passes
- [x] 1.2 Add assertions in `internal/demo/demo_test.go` verifying that all seeded demo products match the expected standardized names and remain searchable via FTS5 (`products_fts`); verify `go test -v ./internal/demo/...` passes

## 2. Full Verification

- [x] 2.1 Run `go test ./...`, `go vet ./...`, and `gopls check` on Go files (resolving `gopls` from `PATH` or `$(go env GOPATH)/bin/gopls`) and confirm zero test failures or diagnostics

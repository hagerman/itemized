# Tasks

## 1. Resolve `sql.Rows.Err()` `gopls` Diagnostics

- [x] 1.1 Check `statRows.Err()` after the `statRows.Next()` loop in `internal/api/catalog.go` (`loadProducts`) and return any error; verify `$(go env GOPATH)/bin/gopls check internal/api/catalog.go` no longer reports a diagnostic on `statRows`
- [x] 1.2 Check `bRows.Err()` after the `bRows.Next()` loop in `internal/api/catalog.go` (`listVariantsWithBarcodes`) and return any error (closing `bRows` safely); verify `$(go env GOPATH)/bin/gopls check internal/api/catalog.go` reports zero diagnostics
- [x] 1.3 Check `rows.Err()` after the `rows.Next()` loop in `internal/api/items.go` (`productRecentDueOffsets`), returning `nil` on iteration error; verify `$(go env GOPATH)/bin/gopls check internal/api/items.go` reports zero diagnostics

## 2. Automate `gopls` Verification in OpenSpec Config

- [x] 2.1 Update `openspec/config.yaml` with `rules.tasks` (requiring a verification task for `go test ./...`, `go vet ./...`, and `gopls check`) and `operations.apply.guidance` (instructing apply to run `go test ./...`, `go vet ./...`, and `gopls check` using `gopls` on `PATH` or `$(go env GOPATH)/bin/gopls`, resolving all diagnostics before completing); verify `openspec list --json` and `openspec status --change resolve-gopls-diagnostics --json` parse `openspec/config.yaml` without errors

## 3. End-to-End Verification

- [x] 3.1 Run `go test ./...`, `go vet ./...`, and `$(go env GOPATH)/bin/gopls check $(find cmd internal web -name '*.go')` across the full repository and verify all checks exit 0 with zero diagnostics

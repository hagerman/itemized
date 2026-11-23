# Proposal

## Why

`gopls check` currently reports three missing `sql.Rows.Err()` diagnostics across `internal/api`, and nothing in the OpenSpec workflow checks `gopls` during implementation. Resolving the existing diagnostics and adding `gopls check` guidance to `openspec/config.yaml` prevents silent row-iteration errors and keeps future changes clean automatically.

## What Changes

- Check `statRows.Err()` after the `statRows.Next()` loop in `internal/api/catalog.go` (`loadProducts`).
- Check `bRows.Err()` after the `bRows.Next()` loop in `internal/api/catalog.go` (`listVariantsWithBarcodes`).
- Check `rows.Err()` after the `rows.Next()` loop in `internal/api/items.go` (`productRecentDueOffsets`).
- Configure `openspec/config.yaml` with `rules.tasks` and `operations.apply.guidance` so every future OpenSpec change includes and runs `go test ./...`, `go vet ./...`, and `gopls check` (resolving `gopls` from `PATH` or `$(go env GOPATH)/bin/gopls`) before completion.

## Capabilities

### New Capabilities

<!-- None: pure static-analysis hygiene and OpenSpec workflow configuration; no externally observable product behavior changes. -->

### Modified Capabilities

<!-- None: tracked via `skip_specs: true` in `.openspec.yaml`. -->

## Impact

- `internal/api/catalog.go`
- `internal/api/items.go`
- `openspec/config.yaml`

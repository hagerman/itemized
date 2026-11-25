# Tasks

## 1. Remove Migration CLI & Prune Dependencies

- [x] 1.1 Delete `cmd/itemized-migrate/` (`main.go` and `migrate_test.go`) and verify the directory is removed from the repository
- [x] 1.2 Run `go mod tidy` to remove `github.com/jackc/pgx/v5` and migration-only transitive dependencies from `go.mod` and `go.sum`, and verify no `pgx` entries remain in `go.mod`

## 2. Update Build, Docs, and Ignore Rules

- [x] 2.1 Update `Dockerfile` to remove the `itemized-migrate` Go build step, runtime `COPY`, and Stage 2 migration CLI comment, and verify `Dockerfile` no longer references `itemized-migrate`
- [x] 2.2 Remove the `## Migrating Legacy PostgreSQL Data` section from `README.md` and `/itemized-migrate` from `.gitignore`, and verify no references to `itemized-migrate` remain in tracked non-archive files

## 3. Verification

- [x] 3.1 Run `go test ./...`, `go vet ./...`, and `gopls check` on Go files (along with `go build ./cmd/itemized`) and verify all tests, vet checks, and diagnostics pass without errors, including `legacy_uuid` resolution tests

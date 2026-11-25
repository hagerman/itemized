# Proposal

## Why

The standalone `itemized-migrate` PostgreSQL-to-SQLite migration CLI was built for a one-time migration from the legacy Itemized application. The sole user has completed that migration, so maintaining the CLI, its PostgreSQL driver dependencies (`pgx/v5`), its Docker build stage/binary, and its documentation adds unnecessary maintenance overhead and image bloat.

## What Changes

- **BREAKING**: Remove the `cmd/itemized-migrate` package (`main.go` and `migrate_test.go`), retiring the `itemized-migrate` companion CLI.
- Update `Dockerfile` to stop building and copying `/usr/local/bin/itemized-migrate` into the container image.
- Prune unused PostgreSQL client dependencies (`github.com/jackc/pgx/v5`, `github.com/jackc/pgpassfile`, `github.com/jackc/pgservicefile`, and any other migration-only transitive modules) from `go.mod` and `go.sum` via `go mod tidy`.
- Remove the `## Migrating Legacy PostgreSQL Data` section from `README.md` and the `/itemized-migrate` entry from `.gitignore`.
- Preserve `legacy_uuid` columns, indexes, and `/go/{i,p,l}/<legacy_uuid>` QR resolution in the server and database schema so already-migrated inventory records and printed labels continue to work.

## Capabilities

### New Capabilities
<!-- None -->

### Modified Capabilities
- `legacy-migration`: Remove all requirements for the standalone `itemized-migrate` PostgreSQL-to-SQLite CLI (direct migration, foreign-key remapping/credential copy, and FTS5 rebuild/integrity verification).

## Impact

- **Removed code**: `cmd/itemized-migrate/main.go`, `cmd/itemized-migrate/migrate_test.go`
- **Build & container**: `Dockerfile` (smaller Go build and runtime image without the second binary)
- **Dependencies**: `go.mod`, `go.sum` (removal of `github.com/jackc/pgx/v5` and its supporting packages)
- **Docs & repo hygiene**: `README.md`, `.gitignore`
- **Preserved behavior**: Runtime server (`cmd/itemized`), SQLite schema migrations (`internal/db/migrations/`), `legacy_uuid` columns and QR code resolution (`/go/i/:id`, `/go/p/:id`, `/go/l/:id`), and bcrypt password authentication remain unchanged.

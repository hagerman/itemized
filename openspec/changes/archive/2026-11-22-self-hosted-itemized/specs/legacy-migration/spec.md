# Spec Delta

## Purpose

Provides a standalone companion CLI (`itemized-migrate`) to migrate historical inventory data from a legacy Itemized PostgreSQL database into the self-hosted SQLite database with full ID and credential continuity.

## ADDED Requirements

### Requirement: Direct PostgreSQL-to-SQLite migration
The `itemized-migrate` CLI SHALL accept a PostgreSQL connection URL (`--pg-url`) and target SQLite database path (`--sqlite`), initialize the target SQLite schema, and copy all household inventory data in a single atomic transaction.

#### Scenario: Single-collection database migrates automatically
- **WHEN** the legacy PostgreSQL database contains exactly one collection and `--collection-id` is omitted
- **THEN** the CLI automatically selects that collection and migrates all associated categories, locations, products, variants, barcodes, items, printers, and users

#### Scenario: Multi-collection database requires explicit selection
- **WHEN** the legacy PostgreSQL database contains multiple collections and `--collection-id` is omitted
- **THEN** the CLI exits non-zero and prints the available collection IDs and names so the user can pass `--collection-id`

### Requirement: Foreign-key remapping, legacy UUID preservation, and credential continuity
The migration CLI SHALL assign new integer primary keys to all migrated entities (`User`, `Category`, `Location`, `Product`, `Variant`, `Barcode`, `Item`, `Printer`), accurately remap all foreign-key references (including self-referential `parent_id` hierarchies on `Category` and `Location`), store the original PostgreSQL UUID in `legacy_uuid` on `Item`, `Product`, and `Location`, and copy `users.password_digest` verbatim into `users.password_hash` so existing printed QR codes and user passwords continue working without re-labeling or password resets.

#### Scenario: Migrated item QR and user login work immediately
- **WHEN** migration completes and the self-hosted server boots against the migrated SQLite file
- **THEN** existing `/go/i/<legacy-uuid>`, `/go/p/<legacy-uuid>`, and `/go/l/<legacy-uuid>` QR labels resolve via `legacy_uuid` to the exact migrated records and the migrated user can log in with their existing password

### Requirement: Search index rebuild and integrity verification
After copying rows, the migration CLI SHALL populate the SQLite FTS5 product search index, run `PRAGMA foreign_key_check`, and print a per-table source-vs-destination row count summary.

#### Scenario: Integrity verification passes
- **WHEN** all tables finish migrating with zero foreign-key violations
- **THEN** the CLI commits the transaction, prints row counts per table, and exits with status 0

# Spec Delta

## REMOVED Requirements

### Requirement: Direct PostgreSQL-to-SQLite migration
**Reason**: The one-time legacy PostgreSQL-to-SQLite migration has been completed by its sole user, so the standalone `itemized-migrate` CLI is no longer needed.
**Migration**: No replacement CLI is provided. Historical migration code remains accessible in git history if ever needed for reference.

### Requirement: Foreign-key remapping, legacy UUID preservation, and credential continuity
**Reason**: The standalone `itemized-migrate` CLI is being removed after migration completion.
**Migration**: Already-migrated SQLite databases retain their `legacy_uuid` values and bcrypt password hashes, and the runtime server continues to support `/go/{i,p,l}/<legacy-uuid>` QR resolution and bcrypt login under `barcode-scanning`, `inventory-catalog`, and `user-auth`.

### Requirement: Search index rebuild and integrity verification
**Reason**: The standalone `itemized-migrate` CLI is being removed after migration completion.
**Migration**: Runtime FTS5 triggers and SQLite foreign-key constraints continue to maintain search index and referential integrity during normal server operation.

# Spec Delta

## ADDED Requirements

### Requirement: Idempotent starter taxonomy seeding
The system SHALL provide `POST /api/onboarding/starter-taxonomy` for authenticated users to atomically seed curated grocery-store categories (`Groceries`, `Household`) and universal household locations (`Kitchen`, `Garage`, `Bathroom`, `Laundry` with freezer flags). It SHALL accept optional `categories` and `locations` booleans (defaulting to `true`), skip existing case-insensitive trimmed names under the same parent, and return HTTP 200 with created counts.

#### Scenario: Loading full starter taxonomy on a fresh instance
- **WHEN** an authenticated user sends `POST /api/onboarding/starter-taxonomy` with an empty body `{}` on an instance with zero categories and zero locations
- **THEN** the system inserts the curated `Groceries` and `Household` category trees and the `Kitchen`, `Garage`, `Bathroom`, and `Laundry` location trees (with `Kitchen > Freezer` and `Garage > Chest Freezer` marked `is_freezer = true`) in a single transaction
- **AND** returns HTTP 200 with `categories_created > 0` and `locations_created > 0`

#### Scenario: Re-running starter taxonomy is idempotent
- **WHEN** an authenticated user sends `POST /api/onboarding/starter-taxonomy` after starter taxonomy (or a subset of matching category/location names) already exists
- **THEN** existing categories and locations matching by case-insensitive trimmed name under the same parent are preserved without creating duplicates
- **AND** only missing starter nodes are inserted, returning HTTP 200 with accurate created counts (including `0` when all starter nodes already exist)

#### Scenario: Loading only categories or only locations
- **WHEN** an authenticated user sends `POST /api/onboarding/starter-taxonomy` with `{ "categories": true, "locations": false }` (or vice versa)
- **THEN** the system seeds only the requested taxonomy type and leaves the other table untouched

#### Scenario: Unauthenticated request is rejected
- **WHEN** an unauthenticated client sends `POST /api/onboarding/starter-taxonomy`
- **THEN** the system rejects the request with HTTP 401 Unauthorized

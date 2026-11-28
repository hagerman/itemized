# Spec Delta

## ADDED Requirements

### Requirement: Per-user quick actions preference
Each user account SHALL persist a boolean `quick_actions_enabled` preference defaulting to `true` for all existing and newly created accounts. Serialized user responses across authentication and user endpoints SHALL include `quick_actions_enabled`. Authenticated users SHALL be able to update `quick_actions_enabled` via `PATCH /api/auth/account` independently of email, password, or theme changes.

#### Scenario: Newly created user defaults to quick actions enabled
- **WHEN** a new user account is created via first-run setup, admin user creation, or OIDC auto-provisioning
- **THEN** the persisted user record has `quick_actions_enabled` set to `true` and the serialized user response includes `"quick_actions_enabled": true`

#### Scenario: Existing users default to quick actions enabled on migration
- **WHEN** the database migration runs against an existing database containing users created prior to this preference
- **THEN** all existing user records default to `quick_actions_enabled = true`

#### Scenario: User toggles quick actions preference via account endpoint
- **WHEN** an authenticated user sends `PATCH /api/auth/account` with `{"quick_actions_enabled": false}`
- **THEN** the system persists `quick_actions_enabled = false` without requiring email, password, or theme fields and returns HTTP 200 with the updated user record

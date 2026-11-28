# Spec Delta

## ADDED Requirements

### Requirement: Per-user theme preference
Each user account SHALL persist a `theme` preference (`system`, `light`, or `dark`), defaulting to `system` for all existing and newly created accounts. Serialized user responses across authentication and user endpoints SHALL include `theme`. Authenticated users SHALL be able to update their `theme` via `PATCH /api/auth/account` independently of email or password changes, and invalid values SHALL be rejected with HTTP 422.

#### Scenario: Newly created user defaults to system theme
- **WHEN** a new user account is created via first-run setup, admin user creation, or OIDC auto-provisioning
- **THEN** the persisted user record has `theme` set to `"system"` and the API response includes `"theme": "system"`

#### Scenario: Existing users receive system theme on migration
- **WHEN** the database migration runs against an existing database containing users created prior to theme support
- **THEN** all existing user records default to `"theme": "system"`

#### Scenario: Authenticated user updates theme preference without changing email or password
- **WHEN** an authenticated user sends `PATCH /api/auth/account` with `{"theme": "light"}` (or `{"theme": "dark"}` or `{"theme": "system"}`)
- **THEN** the system persists the new `theme` value on that user's profile, preserves their existing email, password, and active sessions, and returns HTTP 200 with the updated user object containing the new `theme`

#### Scenario: Invalid theme value is rejected
- **WHEN** an authenticated user sends `PATCH /api/auth/account` with `{"theme": "sepia"}`
- **THEN** the system rejects the request with HTTP 422 and leaves the user's stored `theme` unchanged

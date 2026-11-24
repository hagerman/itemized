# Spec Delta

## MODIFIED Requirements

### Requirement: Closed registration and admin-managed users
The system SHALL disallow public self-registration and SHALL allow authenticated administrators to create, list, update roles (`admin` or `member`) for, disable or delete, and reset passwords for household user accounts, while preventing an administrator from changing their own role or demoting the last remaining administrator.

#### Scenario: Admin creates a household member
- **WHEN** an authenticated administrator submits a new user email, initial password, and role (`admin` or `member`)
- **THEN** the system creates the account with a bcrypt-hashed password and returns the created user without exposing the password hash

#### Scenario: Admin promotes a member to administrator
- **WHEN** an authenticated administrator sends `PATCH /api/users/{id}` with `{"role": "admin"}` for an existing `member` user
- **THEN** the system updates that user's role to `admin` and returns the updated user record

#### Scenario: Admin demotes another administrator to member
- **WHEN** an authenticated administrator sends `PATCH /api/users/{id}` with `{"role": "member"}` for another `admin` user while at least one other administrator exists
- **THEN** the system updates that user's role to `member` and returns the updated user record

#### Scenario: Admin attempts to change their own role
- **WHEN** an authenticated administrator sends `PATCH /api/users/{id}` targeting their own user ID
- **THEN** the system rejects the request with HTTP 422 without modifying the user's role

#### Scenario: Admin attempts to demote the last remaining administrator
- **WHEN** a request attempts to demote the only remaining `admin` user to `member`
- **THEN** the system rejects the request with HTTP 422 without modifying the user's role

#### Scenario: Non-admin attempts to manage users
- **WHEN** an authenticated non-admin user requests user creation, role update, deletion, or password reset for another user
- **THEN** the system rejects the request with HTTP 403

## ADDED Requirements

### Requirement: Forced OIDC authentication
The system SHALL support an administrator-configurable `oidc_force` setting (defaulting to `false`, with `OIDC_FORCE` environment variable fallback) that, when OIDC is configured and `oidc_force` is enabled, enforces OIDC-only authentication by exposing `oidc_force: true` on `GET /api/auth/status` and rejecting all non-OIDC login requests on `POST /api/auth/login` (both cookie and Bearer modes) with HTTP 403.

#### Scenario: Local password login rejected when Force OIDC is active
- **WHEN** OIDC is configured (`oidc_issuer` and `oidc_client_id` are set), `oidc_force` is `true`, and a client submits valid or invalid credentials to `POST /api/auth/login` (cookie or bearer mode)
- **THEN** the system rejects the request with HTTP 403 and does not issue a session cookie or Bearer token

#### Scenario: OIDC login continues to work when Force OIDC is active
- **WHEN** OIDC is configured and `oidc_force` is `true`
- **THEN** `GET /api/auth/oidc/login` and `GET /api/auth/oidc/callback` authenticate users via the OIDC provider and issue a local session as normal

#### Scenario: Enabling Force OIDC requires OIDC configuration
- **WHEN** an administrator sends `PATCH /api/settings` with `oidc_force` set to `true` while OIDC issuer or client ID is not configured (neither persisted nor included in the same request)
- **THEN** the system rejects the request with HTTP 422 and does not enable `oidc_force`

#### Scenario: Clearing OIDC configuration disables Force OIDC
- **WHEN** an administrator clears `oidc_issuer` or `oidc_client_id` via `PATCH /api/settings` while `oidc_force` was enabled
- **THEN** the system automatically resets `oidc_force` to `false` (or reports `oidc_force: false` on `/api/auth/status`) so local login is not locked out without a working OIDC provider

#### Scenario: Auth status advertises Force OIDC state
- **WHEN** a client requests `GET /api/auth/status`
- **THEN** the response includes `"oidc_force": true` if and only if OIDC is configured and `oidc_force` is enabled, and `"oidc_force": false` otherwise

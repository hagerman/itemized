# Spec Delta

## Purpose

Manages household user authentication, account provisioning, and session lifecycle for both web browsers and future native mobile clients without requiring an external email server or reverse-proxy session cookies.

## ADDED Requirements

### Requirement: First-run administrator setup
When no user accounts exist in the database, the system SHALL present a first-run setup flow that creates the initial administrator account and disables the setup flow immediately afterward.

#### Scenario: Initial setup on an empty database
- **WHEN** a client accesses the application and zero users exist
- **THEN** the system allows creating an account with email and password and assigns it the `admin` role
- **AND** subsequent requests to the setup endpoint are rejected with HTTP 403 or 404

### Requirement: Closed registration and admin-managed users
The system SHALL disallow public self-registration and SHALL allow authenticated administrators to create, list, disable or delete, and reset passwords for household user accounts.

#### Scenario: Admin creates a household member
- **WHEN** an authenticated administrator submits a new user email, initial password, and role (`admin` or `member`)
- **THEN** the system creates the account with a bcrypt-hashed password and returns the created user without exposing the password hash

#### Scenario: Non-admin attempts to manage users
- **WHEN** an authenticated non-admin user requests user creation or password reset for another user
- **THEN** the system rejects the request with HTTP 403

### Requirement: Local email and password authentication
The system SHALL authenticate users via email and password verified against bcrypt hashes, including hashes migrated from the legacy application.

#### Scenario: Web login issues session cookie
- **WHEN** a browser submits valid credentials to the login endpoint
- **THEN** the system creates a persisted session and sets an `HttpOnly`, `SameSite=Lax` session cookie

#### Scenario: API client login issues Bearer token
- **WHEN** a client requests token-based login with valid credentials
- **THEN** the system creates a persisted session and returns an opaque Bearer token for use in `Authorization: Bearer <token>` headers

#### Scenario: Invalid credentials rejected
- **WHEN** a client submits an unknown email or incorrect password
- **THEN** the system rejects the request with HTTP 401 without revealing whether the email exists

### Requirement: Optional OIDC authentication
When OIDC provider settings are configured, the system SHALL support Authorization Code Flow with PKCE to authenticate users and issue a local session cookie or Bearer token.

#### Scenario: Linked OIDC user signs in
- **WHEN** a user completes OIDC authentication and `(oidc_issuer, oidc_subject)` matches an existing user
- **THEN** the system establishes a local session for that user

#### Scenario: OIDC disabled by default
- **WHEN** no OIDC provider is configured
- **THEN** the system operates normally using local email and password authentication only

### Requirement: Dual-mode session validation and logout
All protected API endpoints SHALL accept either a valid session cookie or a valid `Authorization: Bearer <token>` header backed by persisted session records, and logout SHALL revoke the active session.

#### Scenario: Request authenticated via Bearer token
- **WHEN** a client calls a protected `/api/*` endpoint with a valid `Authorization: Bearer <token>` header and no cookies
- **THEN** the system authenticates the request as the session's user

#### Scenario: Logout revokes session
- **WHEN** an authenticated user calls the logout endpoint
- **THEN** the system deletes the current session record so the cookie or Bearer token is no longer accepted

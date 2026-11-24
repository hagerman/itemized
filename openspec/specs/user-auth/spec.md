# user-auth Specification

## Purpose

Manages household user authentication, account provisioning, and session lifecycle for both web browsers and future native mobile clients without requiring an external email server or reverse-proxy session cookies.

## Requirements

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
All protected API endpoints SHALL accept either a valid session cookie or a valid `Authorization: Bearer <token>` header backed by persisted session records, logout SHALL revoke the active session, an administrator password reset SHALL revoke all active sessions for that user, and a user changing their own password SHALL revoke all other active sessions for that user.

#### Scenario: Request authenticated via Bearer token
- **WHEN** a client calls a protected `/api/*` endpoint with a valid `Authorization: Bearer <token>` header and no cookies
- **THEN** the system authenticates the request as the session's user

#### Scenario: Logout revokes session
- **WHEN** an authenticated user calls the logout endpoint
- **THEN** the system deletes the current session record so the cookie or Bearer token is no longer accepted

#### Scenario: Admin password reset revokes target user sessions
- **WHEN** an administrator resets another user's password
- **THEN** all persisted sessions for that user are deleted so previously issued cookies and Bearer tokens are immediately rejected with HTTP 401

#### Scenario: Self password change revokes other sessions
- **WHEN** an authenticated user changes their own password via account settings
- **THEN** all other persisted sessions for that user are deleted while the user's current session remains valid

### Requirement: Login rate limiting
The system SHALL rate-limit authentication attempts on `POST /api/auth/login` per client IP address and per normalized email address so repeated attempts are rejected with HTTP 429 Too Many Requests. When `TRUST_PROXY=true` is configured, the system SHALL derive the client IP from `X-Forwarded-For` (rightmost non-private IP, falling back to `X-Real-IP`, then `RemoteAddr`); otherwise it SHALL use `RemoteAddr` directly so spoofed forwarding headers cannot bypass IP rate limiting.

#### Scenario: Excessive login attempts from one IP are throttled
- **WHEN** a client IP exceeds the configured login attempt rate limit
- **THEN** subsequent requests to `POST /api/auth/login` from that IP are rejected with HTTP 429 until the rate-limit window replenishes

#### Scenario: Excessive login attempts against one account are throttled
- **WHEN** repeated login attempts target the same email address across different IPs or headers
- **THEN** subsequent requests for that email address are rejected with HTTP 429 until the rate-limit window replenishes

#### Scenario: Reverse-proxied client IP respected when TRUST_PROXY is enabled
- **WHEN** `TRUST_PROXY=true` is set and requests arrive from the same reverse proxy `RemoteAddr` with distinct client IPs in `X-Forwarded-For`
- **THEN** rate-limit buckets are tracked per forwarded client IP rather than locking out all users behind the proxy

#### Scenario: Forwarding headers ignored when TRUST_PROXY is disabled
- **WHEN** `TRUST_PROXY` is unset or `false` and a client sends varying `X-Forwarded-For` headers
- **THEN** the server ignores `X-Forwarded-For` and rate-limits based on `RemoteAddr`

### Requirement: Request body limits and sanitized API errors
The system SHALL enforce a maximum JSON request body size on API endpoints and SHALL return generic, sanitized error messages on internal or upstream failures rather than raw database, filesystem, or transport error strings.

#### Scenario: Oversized JSON request body rejected
- **WHEN** a client sends a JSON payload exceeding the server's maximum allowed request body size
- **THEN** the system rejects the request with HTTP 413 Request Entity Too Large (or HTTP 400 if decoding fails on the size limit)

#### Scenario: Internal error does not leak raw SQLite or transport details
- **WHEN** an unexpected database or upstream transport error occurs during an API request
- **THEN** the server logs the detailed error internally and returns a generic error message to the client

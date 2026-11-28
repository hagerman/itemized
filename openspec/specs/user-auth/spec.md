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
When OIDC provider settings are configured, the system SHALL support Authorization Code Flow with PKCE to authenticate users and issue a local session cookie or Bearer token. `GET /api/auth/oidc/login` SHALL accept an optional `next` query parameter containing a safe relative in-app path (starting with a single `/` and not `//`, without scheme or host); upon successful cookie-mode OIDC callback, the system SHALL redirect to that validated `next` path (defaulting to `/` when absent or invalid), and the web sign-in screen SHALL pass the current in-app path as `next` when initiating OIDC sign-in so users scanning `/go/...` QR links return directly to the scanned screen.

#### Scenario: Linked OIDC user signs in
- **WHEN** a user completes OIDC authentication and `(oidc_issuer, oidc_subject)` matches an existing user
- **THEN** the system establishes a local session for that user

#### Scenario: OIDC disabled by default
- **WHEN** no OIDC provider is configured
- **THEN** the system operates normally using local email and password authentication only

#### Scenario: OIDC sign-in preserves a scanned QR path via next
- **WHEN** an unauthenticated user visits `/go/i/42` and initiates OIDC login via `GET /api/auth/oidc/login?next=%2Fgo%2Fi%2F42`
- **THEN** after completing the OIDC callback in cookie mode, the system redirects the browser to `/go/i/42`

#### Scenario: Unsafe external next parameter is ignored on OIDC login
- **WHEN** a client requests `GET /api/auth/oidc/login?next=https://evil.example/phish` or `GET /api/auth/oidc/login?next=//evil.example`
- **THEN** after completing the OIDC callback in cookie mode, the system ignores the unsafe value and redirects to `/`

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

### Requirement: Personal API tokens for Bearer authentication
Each authenticated user SHALL be able to create, list, and revoke named Personal API Tokens (`itm_...`) via `GET /api/auth/tokens`, `POST /api/auth/tokens`, and `DELETE /api/auth/tokens/{id}` (disabled with HTTP 403 in demo mode). Tokens SHALL be stored as SHA-256 hashes with a short visible prefix, optional `expires_at`, and `last_used_at` tracking, returned in plaintext only once upon creation, and accepted as `Authorization: Bearer <token>` on all protected `/api/*` endpoints.

#### Scenario: Creating a Personal API Token reveals the secret once
- **WHEN** an authenticated user sends `POST /api/auth/tokens` with `{"name": "Home Assistant"}` (and optional `expires_in_days`)
- **THEN** the system creates the token record storing only its SHA-256 hash and visible prefix, returns HTTP 201 with both the token metadata and the plaintext `itm_...` `token` string, and subsequent `GET /api/auth/tokens` calls return only metadata (never the plaintext secret or hash)

#### Scenario: Authenticating API requests with a Personal API Token
- **WHEN** a client sends a protected `/api/*` request with `Authorization: Bearer <itm_token>` for a non-expired token
- **THEN** the system authenticates the request as the owning user (enforcing that user's `admin`/`member` role), updates `last_used_at`, and serves the request normally

#### Scenario: Revoking or expiring a Personal API Token rejects further use
- **WHEN** the owning user deletes a token via `DELETE /api/auth/tokens/{id}` or the token passes its `expires_at` timestamp
- **THEN** subsequent requests bearing that token are rejected with HTTP 401 Unauthorized

#### Scenario: Users cannot view or revoke another user's Personal API Tokens
- **WHEN** user B lists `GET /api/auth/tokens` or sends `DELETE /api/auth/tokens/{id}` for a token owned by user A
- **THEN** user A's token is not included in user B's list and user B's delete request is rejected with HTTP 404 Not Found

#### Scenario: Blank name or invalid expiration is rejected
- **WHEN** a user sends `POST /api/auth/tokens` with an empty/whitespace name or non-positive `expires_in_days`
- **THEN** the system rejects the request with HTTP 422 Unprocessable Entity

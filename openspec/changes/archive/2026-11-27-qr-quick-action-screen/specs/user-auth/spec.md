# Spec Delta

## MODIFIED Requirements

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

# Spec Delta

## ADDED Requirements

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

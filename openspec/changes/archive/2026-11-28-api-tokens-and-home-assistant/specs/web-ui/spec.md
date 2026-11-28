# Spec Delta

## ADDED Requirements

### Requirement: Personal API Tokens management card in Settings
The Settings page (for all authenticated roles) SHALL provide an **API Tokens** card with a contextual Help link (`settings/api-tokens`), a create form (name + optional expiration preset), a one-time reveal box with a `Copy` button for new tokens, and a token list showing name, masked prefix, timestamps, and a `Revoke` button. Token creation and revocation SHALL be disabled in demo mode.

#### Scenario: Creating and copying a new Personal API Token in Settings
- **WHEN** an authenticated user enters `"Home Assistant"` and submits the **API Tokens** form in Settings
- **THEN** the application calls `POST /api/auth/tokens`, displays the returned plaintext `itm_...` token once with a `Copy` button and a one-time warning, and appends the token's metadata to the list

#### Scenario: Revoking an existing Personal API Token in Settings
- **WHEN** a user clicks `Revoke` on a token in the **API Tokens** card
- **THEN** the application calls `DELETE /api/auth/tokens/{id}` and removes the token from the list

#### Scenario: API Tokens card is disabled in demo mode
- **WHEN** a visitor views Settings while `demoMode` is active
- **THEN** the **API Tokens** creation inputs and button are disabled and a `"Disabled in demo mode"` indicator is shown

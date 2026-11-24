# Spec Delta

## MODIFIED Requirements

### Requirement: Instance settings
The system SHALL persist instance-wide configuration in `Setting` records, including `base_url` (for QR code generation), `due_date_average_count`, optional LLM settings, and optional OIDC settings. Updating instance settings (`PATCH /api/settings`) SHALL be restricted to authenticated administrators.

#### Scenario: Updating due-date average count
- **WHEN** an administrator updates `due_date_average_count` in settings
- **THEN** subsequent average due-date calculations use the updated value

#### Scenario: Non-admin attempts to update instance settings
- **WHEN** an authenticated `member` sends `PATCH /api/settings`
- **THEN** the system rejects the request with HTTP 403 Forbidden and leaves stored settings unchanged

## ADDED Requirements

### Requirement: Bounded batch item creation
Item creation, purchase workflow, and inventory-apply endpoints SHALL enforce a maximum `quantity` of 500 items per request to prevent accidental or abusive database and print-job exhaustion.

#### Scenario: Excessive item quantity rejected
- **WHEN** a client submits `quantity > 500` to `POST /api/items`, `POST /api/workflows/purchase`, or `POST /api/workflows/inventory/apply`
- **THEN** the system rejects the request with HTTP 422 Unprocessable Entity without creating items or triggering print jobs

# Spec Delta

## MODIFIED Requirements

### Requirement: Authentication and settings views
The web application SHALL provide dedicated views for first-run Admin setup, Login (displaying an OIDC sign-in button only when OIDC is configured), and Settings organized into Account (accessible to all authenticated users) and Admin-only sections for Household Users (creation, role management, and password reset), Instance Configuration (`base_url`, `due_date_average_count`, OIDC, LLM), Printers (CRUD + test print), and ZPL Label Templates (editor with variable reference and reset-to-default).

#### Scenario: Non-admin user opens Settings
- **WHEN** a logged-in `member` opens Settings
- **THEN** only Account controls are displayed while Admin-only sections (Instance Configuration, Household Users, Label Printers, and ZPL Label Templates) are hidden and their admin API endpoints are not queried

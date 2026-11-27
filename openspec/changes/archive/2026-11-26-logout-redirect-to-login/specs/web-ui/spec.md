# Spec Delta

## MODIFIED Requirements

### Requirement: Authentication and settings views
The web application SHALL provide dedicated views for first-run Admin setup, Login (displaying an OIDC sign-in button when OIDC is configured, or automatically redirecting to `/api/auth/oidc/login` without rendering the local email/password form when Force OIDC is active on an initialized instance), and Settings organized into Account (accessible to all authenticated users) and Admin-only sections for Household Users (creation, role promotion/demotion between `member` and `admin`, deletion, and password reset), Instance Configuration (`base_url`, `due_date_average_count`, OIDC including Force OIDC, LLM), Printers (CRUD + test print), and ZPL Label Templates (editor with variable reference and reset-to-default). When an authenticated user clicks Logout, the web application SHALL revoke the session via `POST /api/auth/logout`, clear cached authenticated application data, reset the browser route to `/`, and immediately transition to the Login view (or trigger the Force OIDC redirect when Force OIDC is active) without requiring a manual page refresh.

#### Scenario: Non-admin user opens Settings
- **WHEN** a logged-in `member` opens Settings
- **THEN** only Account controls are displayed while Admin-only sections (Instance Configuration, Household Users, Label Printers, and ZPL Label Templates) are hidden and their admin API endpoints are not queried

#### Scenario: Admin changes another user's role in Settings
- **WHEN** a logged-in `admin` changes another user's role dropdown in Household Users from `member` to `admin` (or `admin` to `member`)
- **THEN** the application calls `PATCH /api/users/{id}` with the new role, refreshes the user list, and displays confirmation (while keeping the signed-in admin's own role non-editable)

#### Scenario: Admin configures OIDC options in Settings
- **WHEN** a logged-in `admin` opens Instance Configuration in Settings
- **THEN** both the "Auto-provision new household members on OIDC login" and "Force OIDC login" checkboxes under OIDC settings are disabled until both Issuer URL and Client ID are populated, and saving persists `oidc_auto_provision` and `oidc_force` via `PATCH /api/settings`

#### Scenario: Unauthenticated user lands on login screen with Force OIDC active
- **WHEN** an unauthenticated visitor opens the application on an initialized instance where `GET /api/auth/status` returns `oidc_enabled: true` and `oidc_force: true`
- **THEN** the login view does not render the local email/password form, automatically redirects the browser to `/api/auth/oidc/login`, and displays a redirecting message with a manual "Sign in with OIDC" fallback link

#### Scenario: Logging out returns the user to the login screen immediately
- **WHEN** an authenticated user (signed in via local credentials or optional OIDC) on any route (such as `/` or `/settings`) clicks the Logout button
- **THEN** the application calls `POST /api/auth/logout`, clears cached authenticated data, resets the URL path to `/`, and immediately renders the Login view without requiring a manual page refresh

#### Scenario: Logging out with Force OIDC active initiates OIDC redirect
- **WHEN** an authenticated user on an initialized instance with `oidc_enabled: true` and `oidc_force: true` clicks the Logout button
- **THEN** the application calls `POST /api/auth/logout`, clears cached authenticated data, resets the URL path to `/`, and immediately renders the unauthenticated Force OIDC view which redirects the browser to `/api/auth/oidc/login` without requiring a manual page refresh

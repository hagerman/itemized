# Spec Delta

## MODIFIED Requirements

### Requirement: Authentication and settings views
The web application SHALL provide dedicated views for first-run Admin setup, Login (displaying an OIDC sign-in button when OIDC is configured, or automatically redirecting to `/api/auth/oidc/login` without rendering the local email/password form when Force OIDC is active on an initialized instance), and Settings organized into navigable panels synced to the URL query parameter (`/settings?tab=<id>`, defaulting to `account`): a consistent, top-anchored, independently scrollable left vertical sub-navigation and independently scrollable content pane on desktop (`>= md`) collapsing to a custom styled grouped dropdown menu preserving hierarchy (closing on selection, outside click, or `Escape`) on mobile (`< md`), grouped into **Personal** panels accessible to all authenticated users (**Account & Preferences** [`account`]: email, password, appearance theme, and quick-actions preference; **Notifications** [`notifications`]: PWA push device enrollment, test notification, and daily digest preferences; **API Tokens** [`api-tokens`]: personal Bearer token creation and revocation) and **Admin** panels visible only to administrators (**General** [`general`]: `base_url` and `due_date_average_count`; **Users & SSO** [`users-sso`]: household user management and OIDC configuration including Force OIDC; **AI & Classification** [`ai`]: LLM product classification provider settings; **Label Printing** [`printing`]: printers CRUD + test print and ZPL label template editor with variable reference and reset-to-default). General, OIDC, and AI & Classification forms SHALL each save independently via partial `PATCH /api/settings` requests. When an authenticated user clicks Logout, the web application SHALL revoke the session via `POST /api/auth/logout`, clear cached authenticated application data, reset the browser route to `/`, and immediately transition to the Login view (or trigger the Force OIDC redirect when Force OIDC is active) without requiring a manual page refresh.

#### Scenario: Non-admin user opens Settings
- **WHEN** a logged-in `member` opens Settings (including via a direct admin tab URL such as `/settings?tab=printing`)
- **THEN** only the **Personal** navigation group (`Account & Preferences`, `Notifications`, `API Tokens`) is displayed, any admin tab parameter falls back to `Account & Preferences`, the **Admin** navigation group and panels are hidden, and admin API endpoints (`/api/settings`, `/api/users`, `/api/printers`, `/api/label-templates`) are not queried

#### Scenario: Switching Settings panels updates the URL and active panel
- **WHEN** a logged-in `admin` clicks **Label Printing** in the Settings sub-navigation (or opens the custom mobile dropdown and selects **Label Printing** under **Admin**)
- **THEN** the URL updates to `/settings?tab=printing`, **Label Printing** is indicated as the active navigation item, the desktop left sub-navigation remains anchored at the exact same top and left position without shifting and scrolls independently of the content pane, and the Label Printers and ZPL Label Templates cards are rendered in the content area

#### Scenario: Mobile Settings dropdown preserves Personal and Admin grouping
- **WHEN** a logged-in `admin` opens the custom mobile Settings dropdown on a mobile viewport (`< md`)
- **THEN** the popover menu displays **Personal** (`Account & Preferences`, `Notifications`, `API Tokens`) and **Admin** (`General`, `Users & SSO`, `AI & Classification`, `Label Printing`) group headings, closes when selecting an item, clicking outside, or pressing `Escape`, whereas a logged-in `member` sees only the **Personal** group

#### Scenario: Admin changes another user's role in Settings
- **WHEN** a logged-in `admin` opens the **Users & SSO** panel in Settings and changes another user's role dropdown in Household Users from `member` to `admin` (or `admin` to `member`)
- **THEN** the application calls `PATCH /api/users/{id}` with the new role, refreshes the user list, and displays confirmation (while keeping the signed-in admin's own role non-editable)

#### Scenario: Admin configures OIDC options in Settings
- **WHEN** a logged-in `admin` opens **Users & SSO** in Settings
- **THEN** both the "Auto-provision new household members on OIDC login" and "Force OIDC login" checkboxes under OIDC settings are disabled until both Issuer URL and Client ID are populated, and saving persists `oidc_auto_provision` and `oidc_force` (alongside the other OIDC fields) via `PATCH /api/settings` without requiring or overwriting unrelated General or LLM fields

#### Scenario: Admin saves General or AI settings independently
- **WHEN** a logged-in `admin` edits **Base URL** in the **General** panel (or **LLM Provider** in **AI & Classification**) and clicks its Save button
- **THEN** the application sends a partial `PATCH /api/settings` payload containing only that panel's fields and displays confirmation

#### Scenario: Unauthenticated user lands on login screen with Force OIDC active
- **WHEN** an unauthenticated visitor opens the application on an initialized instance where `GET /api/auth/status` returns `oidc_enabled: true` and `oidc_force: true`
- **THEN** the login view does not render the local email/password form, automatically redirects the browser to `/api/auth/oidc/login`, and displays a redirecting message with a manual "Sign in with OIDC" fallback link

#### Scenario: Logging out returns the user to the login screen immediately
- **WHEN** an authenticated user (signed in via local credentials or optional OIDC) on any route (such as `/` or `/settings`) clicks the Logout button
- **THEN** the application calls `POST /api/auth/logout`, clears cached authenticated data, resets the URL path to `/`, and immediately renders the Login view without requiring a manual page refresh

#### Scenario: Logging out with Force OIDC active initiates OIDC redirect
- **WHEN** an authenticated user on an initialized instance with `oidc_enabled: true` and `oidc_force: true` clicks the Logout button
- **THEN** the application calls `POST /api/auth/logout`, clears cached authenticated data, resets the URL path to `/`, and immediately renders the unauthenticated Force OIDC view which redirects the browser to `/api/auth/oidc/login` without requiring a manual page refresh

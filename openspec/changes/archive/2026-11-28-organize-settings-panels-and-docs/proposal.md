# Proposal

## Why

The Settings page (`/settings`) has grown into a single ~1,300-line vertical scroll mixing personal preferences (Account, Appearance, Quick Actions, Push Notifications, API Tokens) and admin infrastructure (General, OIDC, LLM, Household Users, Label Printers, ZPL Templates) inside one page, with unrelated admin settings bundled into a single form. Additionally, documentation has drifted: Push Notifications has no guide page or contextual Help link, and existing Settings guides reference the old flat layout.

## What Changes

- Reorganize `/settings` into an independent split-pane two-column layout on desktop (`>= md`) with a top-anchored, independently scrollable left vertical sub-navigation grouped into **Personal** and **Admin** sections and an independently scrollable content pane, collapsing on mobile (`< md`) to a custom styled grouped dropdown menu preserving the **Personal** and **Admin** hierarchy, with active panel state synced to the URL query parameter (`/settings?tab=<id>`).
- Apply the same independent split-pane desktop sub-navigation and custom styled grouped mobile dropdown layout to the in-app `/help` and `/help/*` views (grouped into **Overview**, **Get started**, **Use itemized**, and **Configure & connect**) via a `splitPane` layout mode so the left navigation never shifts vertically or horizontally and scrolls independently of long guides.
- Group Settings into seven focused panels:
  - **Personal** (all authenticated users): **Account & Preferences** (`account`), **Notifications** (`notifications`), and **API Tokens** (`api-tokens`).
  - **Admin** (administrators only; hidden from `member` users): **General** (`general`), **Users & SSO** (`users-sso`), **AI & Classification** (`ai`), and **Label Printing** (`printing`).
- Split the monolithic Instance Configuration form into independent saveable forms for General (`base_url`, `due_date_average_count`), OIDC (`Users & SSO`), and LLM Product Classification (`AI & Classification`) using the existing partial `PATCH /api/settings` endpoint.
- Split `SettingsPage.tsx` into modular panel components so future settings can be added cleanly.
- Add a dedicated **Push Notifications** user guide (`docs/configure/push-notifications.md`) covering the `push-notifications` capability, register `settings/notifications` in `APP_SCREENS`, and add a **Learn more** contextual Help link on `NotificationsCard`.
- Update all Settings-related documentation, contextual Help references, demo-mode banner copy, and automated screenshot capture (`settings.png`, `settings-printers.png`, `settings-notifications.png`), then rebuild the in-app Help bundle and `README.md`.

## Capabilities

### New Capabilities
<!-- None; this change refines existing web-ui and documentation requirements. -->

### Modified Capabilities
- `web-ui`: Reorganize the Settings view into grouped Personal and Admin navigation panels with consistent non-shifting left alignment, URL-synced tab state (`?tab=<id>`), independent save actions for General, OIDC, and LLM settings, and a grouped mobile dropdown selector while preserving role-based visibility and non-admin API isolation.
- `documentation`: Ensure every Settings panel and feature—including Push Notifications (`settings/notifications`, `push-notifications` capability), Appearance, Quick Actions, API Tokens, General, Users & SSO, AI & Classification, and Label Printing—is reflected in the user guide, contextual Help screen registry, and automated screenshots, and apply the consistent desktop left vertical sub-navigation and grouped mobile dropdown layout to the in-app `/help` view.

## Impact

- **Frontend (`web/src/`)**: `App.tsx`, `Layout.tsx`, `SettingsPage.tsx`, `HelpPage.tsx`, new shared `SectionNavLayout.tsx`, new modular settings panel components under `web/src/components/settings/`, `NotificationsCard.tsx`, `screens.ts`, `screens.test.ts`, `SettingsPage.test.tsx`, `HelpPage.test.tsx`.
- **Docs & Tooling (`docs/`, `web/scripts/docs/`, `README.md`)**: New `docs/configure/push-notifications.md`; updated `docs/configure/settings.md`, `accounts-and-sso.md`, `api-tokens-and-integrations.md`, `label-printing.md`, `upc-and-ai.md`, `docs/use/inventory-and-expiration.md`, `docs/self-hosting/configuration.md`; updated `web/scripts/docs/screenshots.ts`; regenerated `web/src/generated/help/` and `README.md`.
- **Backend (`internal/`)**: No API or database changes required (`PATCH /api/settings` already supports partial updates).

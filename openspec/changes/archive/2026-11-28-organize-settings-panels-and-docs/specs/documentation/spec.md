# Spec Delta

## MODIFIED Requirements

### Requirement: User guide
The documentation SHALL include a task-oriented user guide for people using Itemized. It SHALL cover:
- getting started
- inventory and expiration tracking (including due-soon, overdue, and rolling-average due-date rules)
- locations and categories (nested hierarchy and freezer locations)
- barcode and QR scanning workflows (Purchase, Consume, Open, Transfer, and Location Inventory Audit)
- variants and barcodes (including merging and bulk reclassification)
- UPC lookup and optional AI classification
- shopping list and minimum stock levels
- Zebra ZPL label printing and custom templates
- push notifications (PWA device enrollment, HTTPS and iOS Home Screen requirements, daily digests, and test notifications)
- API tokens and external integrations
- search and keyboard shortcuts
- household accounts and OIDC sign-in
- installing Itemized as a mobile PWA
- demo mode
- settings (reflecting every Settings panel and option under Personal and Admin navigation groups)
- troubleshooting

User guide pages SHALL be under 600 words each and lead with a screenshot. The keyboard shortcuts guide SHALL be generated from the app's canonical shortcut table so the `?` overlay and the guide cannot drift. An automated screenshot script SHALL capture up-to-date UI screenshots against a seeded local Itemized instance (using demo seed data) while hiding the demo-mode banner on standard user guide screenshots so screenshots reflect a normal household instance and can be refreshed reproducibly.

#### Scenario: First steps
- **WHEN** a new user opens Getting started
- **THEN** it walks them from first-run setup to adding a product, scanning/recording stock, and checking Due Soon and Shopping List, with a screenshot, in a few minutes of reading

#### Scenario: Keyboard reference matches the app
- **WHEN** a shortcut is added to or changed in the app's canonical shortcut table
- **THEN** the `?` keyboard shortcuts overlay and the keyboard shortcuts guide both reflect the change after the next docs build with no separate manual edit

#### Scenario: Automated screenshot capture
- **WHEN** a contributor runs the screenshot capture target
- **THEN** it launches or connects to a seeded Itemized instance and captures the user guide screenshots referenced by `docs/` into `docs/assets/` with the demo-mode banner hidden (including Settings panel views such as `settings.png`, `settings-notifications.png`, and `settings-printers.png`)

#### Scenario: Word count limit enforced
- **WHEN** a user guide page exceeds 600 words
- **THEN** the docs check fails and names the page and its word count

#### Scenario: Push notifications guide and contextual Help
- **WHEN** a user clicks **Learn more** on the Push Notifications card in Settings (or opens the Push Notifications guide in Help)
- **THEN** the Push Notifications user guide opens covering device enrollment, HTTPS/iOS requirements, daily digest toggles and send time, and test notifications, and `docs-check` verifies `push-notifications` capability and `settings/notifications` screen coverage

### Requirement: Help inside the app
The web application SHALL include a `/help` view bundling the user guide for its own version, available offline and searchable, reachable from the sidebar footer, every page header, the `?` keyboard shortcuts cheat sheet, and the keyboard shortcut `g` then `?`. `/help` and `/help/*` SHALL use the same consistent, top-anchored, independently scrollable left vertical sub-navigation and independently scrollable content pane on desktop (`>= md`) and custom styled grouped dropdown menu on mobile (`< md`) as Settings, organizing **Overview** (`/help`) and all user guide pages under `Get started`, `Use itemized`, and `Configure & connect`. Each in-app guide page SHALL be under 600 words with a screenshot first. Links between user guide pages SHALL navigate inside the app; links to admin or developer pages SHALL open the corresponding documentation website URL in a new tab. The Help bundle SHALL be lazy-loaded only when the Help view or contextual Help panel is opened so initial app bundle size is unaffected.

#### Scenario: Offline help
- **WHEN** the installed app is offline and the user opens Help and searches for `"ZPL"`
- **THEN** matching sections of the label printing guide are found and displayed from the bundled offline data

#### Scenario: Version match
- **WHEN** a self-hosted instance runs an older release than the public docs website
- **THEN** its in-app Help shows the user guide for the exact version that instance is running

#### Scenario: Keyboard shortcut opens Help
- **WHEN** a user presses `g` then `?` outside an input field
- **THEN** the application navigates to `/help`

#### Scenario: Navigating guides via Help sub-navigation and mobile grouped dropdown
- **WHEN** a user views `/help` or `/help/*` on desktop or mobile and selects a guide from the independently scrollable desktop left sub-navigation or custom grouped mobile dropdown (`Get started`, `Use itemized`, `Configure & connect`)
- **THEN** the application navigates directly to `/help/<slug>`, highlights that guide as active without shifting the left sub-navigation vertically or horizontally, scrolls the left navigation independently of the article pane on desktop, and allows returning to **Overview** (`/help`) from the same selector

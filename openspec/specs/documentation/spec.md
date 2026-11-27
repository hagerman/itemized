# documentation Specification

## Purpose

Defines how Itemized is documented: a single Markdown source under `docs/` that builds both a standalone static documentation website and the offline in-app Help, the user guide and automated screenshots, contextual help in the app, the self-hosting handbook, verified configuration and API references, the contributor guide, WCAG 2.2 AA accessibility, and the CI checks that keep all documentation complete and accurate.

## Requirements

### Requirement: One documentation source
All documentation SHALL be written once as Markdown under `docs/` with YAML front matter naming its `title`, `summary`, `audience` (`user`, `admin`, or `developer`), `entry_point`, the `capabilities` it covers, and the app `screens` it explains. The static documentation website and the in-app Help bundle SHALL be generated from these files at build time and never edited by hand.

#### Scenario: Edit once, both update
- **WHEN** a contributor changes a sentence in `docs/configure/label-printing.md` and runs the docs build
- **THEN** the generated static website page and the generated in-app Help bundle both contain the updated sentence

#### Scenario: Missing front matter
- **WHEN** a Markdown page under `docs/` is missing required front matter fields (`title`, `summary`, `audience`, or `entry_point`)
- **THEN** the docs check fails and names the file and missing fields

### Requirement: Documentation stays complete and correct
The docs check SHALL run in CI and fail when the generated in-app Help bundle is stale, a link between pages or to a heading anchor does not resolve, an image is missing or has empty alt text, a capability in `openspec/specs/` is covered by no page, a Help link or screen ID in the app points to a page or section that does not exist, or the static documentation website fails to build.

#### Scenario: Broken anchor
- **WHEN** a page links to `barcode-scanning.md#audit-mode` and that heading was renamed or removed
- **THEN** CI fails and reports the broken link and the page it appears on

#### Scenario: Uncovered capability
- **WHEN** a change adds `openspec/specs/meal-planning/` and no docs page lists `meal-planning` in its `capabilities:` front matter
- **THEN** CI fails until a page covers it

#### Scenario: No committed website output
- **WHEN** a docs page changes
- **THEN** the commit contains the Markdown source, any updated screenshots, and the regenerated in-app Help bundle only, while the static documentation website is built by CI rather than committed

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
- search and keyboard shortcuts
- household accounts and OIDC sign-in
- installing Itemized as a mobile PWA
- demo mode
- settings
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
- **THEN** it launches or connects to a seeded Itemized instance and captures the user guide screenshots referenced by `docs/` into `docs/assets/` with the demo-mode banner hidden

#### Scenario: Word count limit enforced
- **WHEN** a user guide page exceeds 600 words
- **THEN** the docs check fails and names the page and its word count

### Requirement: Documentation website
Every release and CI build SHALL produce the documentation as a standalone static website bundle (deployable to GitHub Pages or `/docs/` on `itemizedapp.com`) with sidebar navigation, an "On this page" outline, client-side search over a prebuilt index, the version described, and an "Edit this page" link pointing to the source file on GitHub. Every page SHALL belong to one of six entry points (`Get started`, `Use itemized`, `Configure & connect`, `Self-host`, `API & reference`, `Under the hood`). The landing page SHALL display the search input and the six entry points, each with a one-line description, its key pages, and a link to its section page; each section page SHALL list every page of its entry point with its summary. The sidebar SHALL follow the entry points, and every page SHALL display its entry point in a breadcrumb. The header and footer SHALL carry itemized navigation links (`Docs`, `Demo` linking to `https://demo.itemizedapp.com`, and `GitHub` linking to `https://github.com/itemizedapp/itemized`). Pages SHALL be readable and navigable without JavaScript, no search query SHALL be sent over the network, and no page SHALL request assets (including fonts or stylesheets) from any third-party origin.

#### Scenario: Client-side search
- **WHEN** a visitor types `"freezer"` in the docs website search
- **THEN** matching sections of the locations and inventory guides are listed with a snippet, and activating a result navigates to that section

#### Scenario: No JavaScript
- **WHEN** a visitor opens any docs website page with JavaScript disabled
- **THEN** the page content, breadcrumbs, sidebar navigation, on-this-page links, and header/footer links all work; only interactive search is unavailable

#### Scenario: No third-party requests
- **WHEN** a docs website page is loaded with every request outside its own origin blocked
- **THEN** the page renders completely with zero failed external requests for scripts, styles, images, or fonts

#### Scenario: Responsive header navigation
- **WHEN** a visitor opens a docs page at 390 px viewport width without JavaScript and opens the navigation menu
- **THEN** the header provides links to `Docs`, `Demo`, and `GitHub` without horizontal overflow

### Requirement: Help inside the app
The web application SHALL include a `/help` view bundling the user guide for its own version, available offline and searchable, reachable from the sidebar footer, every page header, the `?` keyboard shortcuts cheat sheet, and the keyboard shortcut `g` then `?`. Each in-app guide page SHALL be under 600 words with a screenshot first. Links between user guide pages SHALL navigate inside the app; links to admin or developer pages SHALL open the corresponding documentation website URL in a new tab. The Help bundle SHALL be lazy-loaded only when the Help view or contextual Help panel is opened so initial app bundle size is unaffected.

#### Scenario: Offline help
- **WHEN** the installed app is offline and the user opens Help and searches for `"ZPL"`
- **THEN** matching sections of the label printing guide are found and displayed from the bundled offline data

#### Scenario: Version match
- **WHEN** a self-hosted instance runs an older release than the public docs website
- **THEN** its in-app Help shows the user guide for the exact version that instance is running

#### Scenario: Keyboard shortcut opens Help
- **WHEN** a user presses `g` then `?` outside an input field
- **THEN** the application navigates to `/help`

### Requirement: Help landing page
The `/help` view's landing page SHALL focus the search input on open, followed by task-shaped quick entries, with the full categorized guide list below grouped under `Get started`, `Use itemized`, and `Configure & connect`. The task-shaped entries SHALL be:
- "Add your first product"
- "Scan a barcode to purchase or consume"
- "Organize locations and categories"
- "Track expiration dates and due rules"
- "Manage your shopping list"
- "Print QR labels on a Zebra printer"
- "Install itemized on your phone"
- "Use keyboard shortcuts"
- "Self-host itemized"

#### Scenario: Task-shaped landing
- **WHEN** a user opens `/help`
- **THEN** focus moves to the search field and all nine task-shaped entries are visible above the full guide list grouped into `Get started`, `Use itemized`, and `Configure & connect`

#### Scenario: Activating a task entry
- **WHEN** a user activates "Print QR labels on a Zebra printer" on the Help landing page
- **THEN** the label printing guide opens directly in the Help view

### Requirement: Contextual help
Every page header, the Scan / Action drawer, the Merge Products and Reclassify Products dialogs, and each Settings card's "Learn more" link SHALL provide a Help action that opens the matching guide section beside the current screen on desktop (or as a bottom/slide-over sheet on mobile) without closing the current screen or dialog or discarding any entered form state. Nothing about Help usage SHALL be stored on the device or user account. Contextual Help SHALL use the local bundled guide so it works offline. Each Settings card screen ID SHALL be declared by exactly one guide page.

#### Scenario: Help while scanning or purchasing
- **WHEN** a user has the Scan / Action drawer open with form fields filled in and activates its Help action
- **THEN** the barcode scanning guide opens in the contextual Help panel, and closing the panel returns to the Scan / Action drawer with all entered values preserved

#### Scenario: Help from a page header
- **WHEN** a user activates the Help button in the page header on `/locations`
- **THEN** the locations and categories guide opens in the contextual Help panel without leaving `/locations`

#### Scenario: Learn more from a Settings card
- **WHEN** a user activates "Learn more" on the Label Printers card in Settings
- **THEN** the label printing guide section opens beside Settings without discarding unsaved edits on the Settings page

#### Scenario: Screen ID without a page
- **WHEN** a change adds a Help link for a screen ID (such as `settings/unknown`) that no docs page declares
- **THEN** the docs check fails and names the offending screen ID and file

### Requirement: Accessible documentation
Both the static documentation website and the in-app Help (full `/help` view and contextual Help panel) SHALL meet WCAG 2.2 AA: semantic landmarks (`header`, `nav`, `main`, `footer`), one `<h1>` per page with no skipped heading levels, a skip-to-content link, visible keyboard focus indicators, at least 4.5:1 text contrast in light and dark themes, descriptive link text, proper `<th>` header cells in tables, `prefers-reduced-motion` respected, no horizontal scroll at 200% zoom or 360 px viewport width, and search result counts announced to screen readers via an `aria-live` region. CI SHALL run automated accessibility checks against the built documentation website and in-app Help.

#### Scenario: Screen reader search announcement
- **WHEN** a screen reader user types a query in the docs or in-app Help search
- **THEN** the number of matching results is announced via a live region and each result is reachable with `Tab` and opens with `Enter`

#### Scenario: Automated accessibility failure in CI
- **WHEN** a change introduces an image without alt text, a skipped heading level, or a WCAG 2.2 AA contrast violation on a docs page or the in-app Help view
- **THEN** the CI accessibility check fails and reports the violation

### Requirement: Every screen has a guide
The web application SHALL export one canonical list of screen IDs covering every app route, every Settings section, and every modal/drawer with a Help action. A web unit test SHALL fail when an application route or Settings section is missing from the screen ID list. The docs build SHALL read the screen ID list and the docs check SHALL fail when any screen ID is declared by no page's `screens:` front matter. A page MAY declare multiple screens, and a non-Settings screen MAY be declared by multiple pages.

#### Scenario: New screen without a docs page
- **WHEN** a change adds a Settings section `settings/notifications` to the screen registry and no docs page declares it
- **THEN** the docs check fails and names `settings/notifications`

#### Scenario: Route missing from screen registry
- **WHEN** a change adds a route to `App.tsx` without registering its screen ID in the canonical screen list
- **THEN** the web unit tests fail and name the unregistered route

### Requirement: Self-hosting handbook
The documentation SHALL include a self-hosting handbook at `docs/self-hosting/README.md` with eight ordered sections:
1. Install, including a table linking every platform guide under `docs/self-hosting/` (Docker Compose, Docker Run, Unraid, and Binary);
2. First run (creating the initial admin account);
3. Reverse proxy and TLS, with Caddy, nginx, and Traefik examples and explicit guidance that HTTPS is required for mobile camera barcode scanning;
4. Backups and a restore drill, showing how to back up the SQLite database safely and restore it into a scratch container while verifying `GET /up` and product/item counts;
5. Upgrading;
6. Monitoring (health check endpoint `GET /up` and logs);
7. Hardening, presented as a checklist;
8. Sizing (memory, CPU, and SQLite disk footprint guidance).

Every platform install page under `docs/self-hosting/` SHALL be linked from the install table in `docs/self-hosting/README.md`, and the docs check SHALL fail when an orphan platform page is not linked.

#### Scenario: Operator path
- **WHEN** an operator follows `docs/self-hosting/README.md` in order
- **THEN** they can go from an empty host to a running Itemized instance behind TLS with a tested backup/restore drill and health monitoring

#### Scenario: Orphan platform page
- **WHEN** a contributor adds `docs/self-hosting/kubernetes.md` without adding a row to the install table in `docs/self-hosting/README.md`
- **THEN** the docs check fails and names `docs/self-hosting/kubernetes.md`

### Requirement: Configuration reference is complete
`docs/self-hosting/configuration.md` SHALL list every environment variable read by Itemized (`cmd/`, `internal/`, and `docker-entrypoint.sh`), each with its default value, an example, whether it can also be edited in Settings, and a link to the page that explains it. No environment variable SHALL be mandatory, and the page SHALL state that first. A Go test SHALL collect all environment variable names read by `cmd/`, `internal/`, and `docker-entrypoint.sh` and SHALL fail when a variable is read in code but missing from `docs/self-hosting/configuration.md`, or listed in the table but never read.

#### Scenario: Undocumented environment variable
- **WHEN** a change makes `internal/api` read a new environment variable `MAX_UPLOAD_MB` without adding a row to `docs/self-hosting/configuration.md`
- **THEN** `go test ./...` fails and names `MAX_UPLOAD_MB` and the file that reads it

#### Scenario: Stale environment variable row
- **WHEN** an environment variable is removed from code while its row remains in `docs/self-hosting/configuration.md`
- **THEN** `go test ./...` fails and names the stale row

### Requirement: API error codes and examples are checked
`docs/api.md` SHALL include an error responses table listing every HTTP error status and canonical error message/code the server returns, with its meaning. A Go test SHALL verify that documented error responses match the server's error catalog without drift. Request examples in `docs/api.md` marked to execute SHALL run in order against an in-process `api.Server` with a signed-in admin and seeded data. The test SHALL fail when the actual HTTP status differs from the documented status or when any documented top-level response JSON key is missing. Executed examples SHALL cover at least one endpoint from each of the auth, categories, locations, products/variants/barcodes, items, scan/workflows, printers/label-templates, and settings route groups, and SHALL include at least one unauthenticated request expecting HTTP 401 and one invalid request expecting HTTP 400.

#### Scenario: Example status drifts
- **WHEN** a documented `POST /api/products` example states HTTP 201 and the handler responds with HTTP 200
- **THEN** the API docs Go test fails and reports the line in `docs/api.md`

#### Scenario: Missing response key
- **WHEN** a documented example declares top-level keys `product` and `variants` and the handler omits `variants`
- **THEN** the API docs Go test fails and names the missing key

#### Scenario: Unauthenticated and invalid examples verified
- **WHEN** the API docs Go test runs
- **THEN** the unauthenticated example receives HTTP 401 and the invalid-input example receives HTTP 400, matching `docs/api.md`

### Requirement: Contributor guide and package map
`CONTRIBUTING.md` SHALL link a contributor guide under `docs/contributing/` containing:
- a first-contribution walkthrough that fits in 30 minutes;
- an architecture tour following one scan/purchase action from the React UI through the Go API and SQLite and back;
- the OpenSpec workflow;
- tests and checks;
- a package map (`docs/contributing/packages.md`) naming every Go package under `internal/` with what it does and what state or external services it can write to.

`docs/architecture.md` SHALL include a table row for every top-level package under `internal/` and mention any sub-packages. Each contributor page SHALL name the commands it relies on, and every `make <target>` command named in `docs/contributing/` SHALL exist as a target in the repository `Makefile`. A Go/repository check run by `make check` and CI SHALL fail when an `internal/` package is missing from `docs/contributing/packages.md` or `docs/architecture.md`, when a removed package remains listed, or when a contributor page references a nonexistent `make` target.

#### Scenario: New internal package without documentation
- **WHEN** a change adds `internal/notifications` without documenting it in `docs/contributing/packages.md` and `docs/architecture.md`
- **THEN** `make check` and `go test ./...` fail and name `internal/notifications`

#### Scenario: Renamed Makefile target
- **WHEN** the `Makefile` renames `docs-check` and a contributor page still references `make docs-check`
- **THEN** `make check` fails and names the page and missing target

### Requirement: README maintained from docs
The repository `README.md` SHALL be generated from `docs/` during the docs build, deriving feature links/summaries from front matter, Quick Start snippets and deployment options from `docs/self-hosting/`, the Configuration table from `docs/self-hosting/configuration.md` with repo-root relative links, and curated UI screenshots exclusively from `docs/assets/`. The docs check SHALL fail if `README.md` is stale, has broken links or missing images/alt text, or violates brand capitalization rules.

#### Scenario: Docs update flows into README
- **WHEN** an environment variable row in `docs/self-hosting/configuration.md` or a Quick Start snippet in `docs/self-hosting/docker-compose.md` is updated and the docs build runs
- **THEN** `README.md` reflects the updated table row or snippet with valid repository-root relative links

#### Scenario: Stale README fails docs check
- **WHEN** `docs/` is modified or `README.md` is edited out of sync without running the docs build
- **THEN** the docs check fails and reports that `README.md` is stale and instructs running `make docs-build`

#### Scenario: README uses automated docs screenshots
- **WHEN** `README.md` is generated from `docs/`
- **THEN** the hero image and screenshot gallery reference existing PNG files under `docs/assets/` with descriptive alt text, and the legacy `docs/screenshot-inventory.jpg` is no longer referenced or present

#### Scenario: Broken image or link in README fails docs check
- **WHEN** a screenshot or relative link referenced by `README.md` does not exist on disk or lacks alt text
- **THEN** the docs check fails and names the missing image, missing link target, or missing alt text in `README.md`

### Requirement: Brand name capitalization in documentation
All authored documentation (`docs/`, `README.md`, `CONTRIBUTING.md`), generated static documentation website pages (`<title>`, headings, entry points, breadcrumbs, footer, and metadata), and generated in-app Help pages and task entries SHALL render the brand name in lowercase as `itemized` everywhere except when `Itemized` is the first word of a sentence. The docs check (`make docs-check`) SHALL automatically fail when non-sentence-start `Itemized` appears in documentation prose, headings, titles, or labels.

#### Scenario: Docs prose and metadata follow lowercase brand rule
- **WHEN** a visitor or user reads any page on the docs website or in-app Help
- **THEN** the brand wordmark, page titles, entry point headings, footer, and mid-sentence copy render `itemized` in lowercase, capitalizing `Itemized` only when it starts a sentence

#### Scenario: Automated brand-casing check catches mid-sentence capitalization
- **WHEN** a contributor writes `"configure Itemized behind Caddy"` in a Markdown file under `docs/`
- **THEN** `make docs-check` fails and names the file and offending phrase

# Spec Delta

## MODIFIED Requirements

### Requirement: One documentation source
All documentation SHALL be written once as Markdown under `docs/` with YAML front matter naming its `title`, `summary`, `audience` (`user`, `admin`, or `developer`), `entry_point`, the `capabilities` it covers, and the app `screens` it explains. The static documentation website and the in-app Help bundle SHALL be generated from these files at build time and never edited by hand.

#### Scenario: Edit once, both update
- **WHEN** a contributor changes a sentence in `docs/configure/label-printing.md` and runs the docs build
- **THEN** the generated static website page and the generated in-app Help bundle both contain the updated sentence

#### Scenario: Missing front matter
- **WHEN** a Markdown page under `docs/` is missing required front matter fields (`title`, `summary`, `audience`, or `entry_point`)
- **THEN** the docs check fails and names the file and missing fields

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

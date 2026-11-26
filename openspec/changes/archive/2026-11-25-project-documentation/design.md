# Design

## Context

See [proposal.md](proposal.md) for motivation and scope.

Itemized is a single-binary Go 1.26 server (`cmd/itemized`, `internal/*`) with an embedded React 19 + TypeScript + Vite 6 + Tailwind CSS 4 SPA (`web/`). It currently has:
- 12 OpenSpec capability specs under `openspec/specs/`
- 8 top-level packages under `internal/` (`api`, `auth`, `db`, `demo`, `domain`, `llm`, `printer`, `upc`)
- 9 routes in `web/src/App.tsx` plus Settings cards (`Account`, `Instance Configuration`, `OIDC`, `LLM Product Classification`, `Household Users`, `Label Printers`, `ZPL Label Templates`) and key overlays (`ScannerDrawer`, `Quick Search`, `Keyboard Shortcuts`, `Merge Products`, `Reclassify Products`)
- A single GitHub Actions workflow (`.github/workflows/docker-publish.yml`) running `npm test`, `npm run build`, `go vet ./...`, and `go test ./...`
- No `Makefile`, no `CONTRIBUTING.md`, no static docs generator, and only `docs/screenshot-inventory.jpg` under `docs/`

## Goals / Non-Goals

**Goals:**
- Keep `docs/` as the sole authored source of truth for all user, self-hosting, API, and contributor documentation.
- Build two deterministic outputs from `docs/`:
  1. A standalone static HTML/CSS/JS website bundle (`dist/docs/`, untracked in git, built in CI and deployable to GitHub Pages or `itemizedapp.com/docs/`) with zero third-party requests and full no-JS readability.
  2. A committed, compact generated TypeScript/JSON help bundle (`web/src/generated/help/`) lazy-loaded by the React SPA only when `/help` or contextual Help is opened.
- Enforce zero drift via fast automated checks (`make check`, `go test ./...`, `npm test`, and CI): front matter, links/anchors, word counts, image existence & alt text, capability coverage, screen ID coverage, environment variable coverage, API error table & live executed API examples, internal package map, `Makefile` target references, and WCAG 2.2 AA accessibility.
- Provide reproducible UI screenshot capture against a locally started `DEMO_MODE=true` Itemized server.

**Non-Goals:**
- Adding a public roadmap page or `ROADMAP.md` (explicitly excluded from this change).
- Replacing `README.md` with generated output (`README.md` remains a concise repository landing page linking to the docs).
- Serving the full static docs website from the Itemized Go binary (the binary embeds the SPA including offline in-app Help; the static site is a standalone release/CI artifact).
- Adding external SaaS search (Algolia, etc.) or third-party font CDNs.

## Decisions

### 1. Custom lightweight TypeScript docs builder (`scripts/docs/`) instead of a heavy SSG (Docusaurus / Starlight / MkDocs)
- **Choice**: Build a small, focused Node/TypeScript pipeline under `scripts/docs/` (using `gray-matter` + `marked` or `markdown-it` + a minimal client-side search index generator) invoked via `npm run docs:build` and `npm run docs:check` (wrapped by `Makefile` targets `docs-build` and `docs-check`).
- **Rationale**:
  - Needs to emit *both* a static HTML website with exact OpenTodo-style invariants (zero third-party requests, no-JS readable HTML, custom six-entry-point landing/section pages, prebuilt offline JSON search index, exact WCAG 2.2 AA markup) *and* the in-app Help bundle (`web/src/generated/help/`) with screen-ID mappings and generated keyboard shortcuts table from `web/src/shortcuts.ts`.
  - Avoids introducing a second framework runtime (Python/MkDocs or a heavy React SSG) into a Go + Vite repo, keeps builds under ~1–2 seconds, and makes custom lint checks (word counts, capability coverage, screen coverage, Settings card uniqueness, platform install table checks, Makefile target checks) trivial to run in one pass.
- **Alternatives considered**:
  - *Astro Starlight / VitePress / Docusaurus*: Heavy dependency trees, harder to guarantee zero-JS header menu + custom dual output to `web/src/generated/help/` without writing custom plugins anyway.
  - *Go static generator*: Possible, but the frontend already has Node 22 + TypeScript + Playwright/axe-core, and parsing `web/src/shortcuts.ts` / `web/src/screens.ts` is native in TypeScript.

### 2. Documentation directory layout and front matter contract
- **Choice**: Organize `docs/` by entry point and audience:
  - `docs/get-started/` (`getting-started.md`, `install-pwa.md`, `demo-mode.md`)
  - `docs/use/` (`inventory-and-expiration.md`, `locations-and-categories.md`, `barcode-scanning.md`, `variants-and-barcodes.md`, `upc-and-ai.md`, `shopping-list.md`, `label-printing.md`, `search-and-shortcuts.md`, `accounts-and-sso.md`, `settings.md`, `troubleshooting.md`)
  - `docs/self-hosting/` (`README.md`, `docker-compose.md`, `docker-run.md`, `unraid.md`, `binary.md`, `configuration.md`)
  - `docs/api.md` (entry point: `Integrate` / `Reference`)
  - `docs/architecture.md` (entry point: `Under the hood`)
  - `docs/contributing/` (`first-contribution.md`, `architecture-tour.md`, `openspec.md`, `tests-and-checks.md`, `packages.md`)
  - `docs/assets/` (screenshots and SVGs, with `docs/screenshot-inventory.jpg` preserved or migrated cleanly)
- **Front matter schema**:
  ```yaml
  ---
  title: Label printing
  summary: Print QR labels directly to Zebra ZSB and raw TCP ZPL printers.
  audience: user # user | admin | developer
  entry_point: use # get-started | use | self-host | integrate | reference | under-the-hood
  order: 8
  capabilities:
    - label-printing
  screens:
    - settings/printers
    - settings/label-templates
  ---
  ```
- **Generated keyboard shortcuts**: `docs/use/search-and-shortcuts.md` includes a marker (e.g., `<!-- GENERATED:SHORTCUTS -->`) replaced at build time from `web/src/shortcuts.ts`, ensuring `?` overlay and docs never diverge.

### 3. In-app Help architecture (`web/src/help/` + `web/src/generated/help/`)
- **Choice**:
  - `web/src/screens.ts` exports the canonical `APP_SCREENS` registry covering every route (`inventory`, `search`, `product-new`, `product-detail`, `product-edit`, `categories`, `locations`, `location-detail`, `settings`, `help`), every Settings card (`settings/account`, `settings/instance`, `settings/oidc`, `settings/llm`, `settings/users`, `settings/printers`, `settings/label-templates`), and every Help-enabled overlay (`dialog/scanner`, `dialog/merge-products`, `dialog/reclassify-products`).
  - `web/src/shortcuts.ts` exports the canonical `KEYBOARD_SHORTCUTS` table (including `g ?` for Help) consumed by `Layout.tsx` and the docs builder.
  - `web/src/generated/help/` contains generated TypeScript/JSON modules (`index.json`, `search.json`, `screens.json`, and rendered sanitized HTML per user-audience page) plus copied/optimized user-guide screenshots under `web/public/help-assets/` so they work offline in the PWA.
  - `HelpProvider` / `ContextualHelpDrawer` in `Layout.tsx` lazily imports `web/src/generated/help/` via `React.lazy` / dynamic `import()` only when `/help` or a contextual Help button is opened.
  - Contextual Help renders as a non-modal side panel on desktop (`lg:`) and a bottom/slide-over sheet on mobile, keeping underlying pages, modals, and form inputs mounted and untouched.
  - Links to `audience: user` pages navigate in-app (`/help/:slug` or inside the contextual drawer); links to `admin` / `developer` pages open `https://itemizedapp.com/docs/...` (configurable base URL, defaulting to the public docs URL) with `target="_blank" rel="noopener noreferrer"`.

### 4. Go drift verification tests (`internal/docsverify/`)
- **Choice**: Add a dedicated Go test package `internal/docsverify/` (run automatically by `go test ./...`) containing three focused test files:
  1. `envvars_test.go`: Uses Go AST (`go/parser`, `go/ast`) to scan `cmd/` and `internal/` for `os.Getenv`, `os.LookupEnv`, and `getSetting(..., "<ENV>", ...)` calls plus regex-scans `docker-entrypoint.sh` for `${VAR:-...}` variables, comparing the collected set against the variable table in `docs/self-hosting/configuration.md`.
  2. `api_docs_test.go`:
     - Parses the error table in `docs/api.md` and verifies it matches a canonical exported/documented error catalog in `internal/api/` (no undocumented or stale error entries).
     - Parses fenced executable HTTP example blocks (e.g., ```` ```http run ````) in `docs/api.md`, boots an in-process `api.NewServer` backed by a temp SQLite DB with a signed-in admin session and seeded data, executes each request in order (supporting simple variable capture like `{{product_id}}` for dependent requests), and asserts HTTP status code and documented top-level JSON response keys across all required route groups plus 401 and 400 examples.
  3. `packages_test.go`: Walks `internal/` to enumerate all Go packages, asserts every package appears in `docs/contributing/packages.md` and every top-level package has a row in `docs/architecture.md`, and verifies every `make <target>` referenced in `docs/contributing/*.md` exists in `Makefile`.
- **Rationale**: Running these inside `go test ./...` guarantees they execute automatically in existing developer workflows and CI without extra runners, and keeps `internal/api` production code clean.

### 5. Automated screenshots & WCAG 2.2 AA checks (Playwright + axe-core)
- **Choice**:
  - Add `@playwright/test` (or `playwright`) and `@axe-core/playwright` as dev dependencies in `web/` (or root `package.json` for scripts).
  - `make docs-screenshots`: Builds/starts `DEMO_MODE=true` Itemized on an ephemeral local port, navigates Playwright across deterministic demo views (Inventory, Product Detail, Locations/Categories, Scanner Drawer, Settings, Label Templates, etc.), injects CSS (`[data-testid="demo-banner"] { display: none !important; }`) to hide the amber demo-mode countdown banner while keeping demo seed data intact, and saves crisp PNG/JPEG screenshots to `docs/assets/`.
  - `make docs-a11y`: Serves the built static docs site (`dist/docs/`) and the built app's `/help` view locally, and runs Playwright + `@axe-core/playwright` configured for `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`, `wcag22aa` at both desktop (`1280x800`) and mobile (`360x780`, plus 200% zoom / no horizontal overflow check), verifying light/dark contrast, landmarks, heading hierarchy, skip link, keyboard Tab/Enter navigation on search results, `aria-live` announcements, and zero third-party network requests.
- **CI integration**: Add a `docs` job to `.github/workflows/docker-publish.yml` (or a dedicated `.github/workflows/docs.yml`) that runs `make docs-check`, `make docs-a11y`, and uploads `dist/docs/` as a build artifact (ready for GitHub Pages deployment on tag/main).

## Risks / Trade-offs

- **Playwright browser install time in CI** → Cache Chromium via GitHub Actions cache or install only `--with-deps chromium` in the dedicated `docs` CI job so `test` and `build-and-push` jobs stay fast and run in parallel.
- **Generated in-app Help bundle size** → Only `audience: user` pages (strictly <600 words each) are bundled into `web/src/generated/help/`, and the module is dynamically imported (`React.lazy`) so initial page load adds 0 KB of help content.
- **Live API docs examples ordering fragility** → Seed deterministic fixture records in `api_docs_test.go` and support minimal `{{id}}` capture between sequential blocks so examples remain readable as real HTTP snippets while staying 100% deterministic.
- **Word count limit (<600 words) vs. depth** → Keep each user guide page focused on one task with a clear screenshot; push deep reference tables (env vars, ZPL template variables, full API reference) to `docs/self-hosting/configuration.md` and `docs/api.md` (which are `admin`/`developer` pages and not subject to the 600-word user guide cap).

## Migration Plan

1. Add `Makefile`, docs build/check tooling, and `web/src/screens.ts` + `web/src/shortcuts.ts`.
2. Author all `docs/` Markdown pages, `CONTRIBUTING.md`, and capture initial screenshots via `make docs-screenshots`.
3. Implement `/help` view, `ContextualHelpDrawer`, Help actions across `Layout`, `SettingsPage`, and overlays, and unit tests.
4. Add `internal/docsverify/` Go tests and Playwright WCAG 2.2 AA tests.
5. Wire `make check` / docs verification into GitHub Actions CI.
6. Rollback is straightforward: revert the commit(s); no database migrations or breaking API changes are introduced.

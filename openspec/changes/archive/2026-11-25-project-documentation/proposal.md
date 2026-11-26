# Proposal

## Why

Itemized currently relies on a single `README.md` for both user orientation and self-hosting setup, with no in-app help, no structured static documentation website, and no automated checks to keep documentation in sync with routes, settings, environment variables, API endpoints, or internal packages. Establishing a single-source documentation system modeled on OpenTodo's `documentation` specification ensures that users, self-hosters, and contributors have accurate, offline-capable, accessible documentation that CI verifies on every change.

## What Changes

- **Single-source Markdown documentation (`docs/`)**: Author all user, self-hosting, API, and contributor documentation once under `docs/` with structured YAML front matter (`title`, `summary`, `audience`, `capabilities`, `screens`, `entry_point`, etc.) and build both the static documentation website and the generated in-app help bundle from those files.
- **Static documentation website**: Generate a standalone static site bundle (deployable to GitHub Pages or `itemizedapp.com/docs/`) with six entry points (*Get started*, *Use Itemized*, *Self-host*, *Integrate*, *Reference*, *Under the hood*), breadcrumbs, sidebar navigation, on-this-page outline, client-side prebuilt search, version label, "Edit this page" links, Itemized navigation (Docs, Demo, GitHub), zero third-party network requests (including fonts), and full readability without JavaScript.
- **In-app Help & contextual help**: Add a lazy-loaded, offline-searchable `/help` view reachable from the sidebar footer, every page header, the keyboard shortcuts cheat sheet (`?`), and `g` then `?`, with a task-shaped landing page and a contextual Help panel/drawer (slide-over beside the current screen on desktop, sheet on mobile) that opens matching guide sections from page headers, key modals/drawers (Scanner, Merge, Reclassify), and Settings cards without discarding user input.
- **Screen registry & keyboard shortcut single source**: Export a canonical TypeScript list of app screen IDs (every route, Settings section, and dialog with a Help action) and a canonical keyboard shortcut table so both the `?` cheat sheet and the keyboard shortcuts guide stay in sync automatically.
- **User guide, Self-hosting handbook, API reference, and Contributor guide**: Write task-oriented user guides (under 600 words each, with screenshots captured automatically), an 8-section self-hosting handbook (`docs/self-hosting/README.md`) with platform install guides (Docker Compose, Docker Run, Unraid, Binary) and a complete environment variable reference (`docs/self-hosting/configuration.md`), an executable API reference (`docs/api.md`) with error code table, and a contributor guide (`CONTRIBUTING.md` + `docs/contributing/` + `docs/architecture.md` + `Makefile`).
- **Automated CI verification & WCAG 2.2 AA accessibility**: Add a docs build/check pipeline, Go drift tests (environment variables, API error codes and executed API examples against an in-process server, internal package map), web unit tests (screen registry coverage), automated UI screenshot capture, and automated WCAG 2.2 AA accessibility checks in GitHub Actions CI.

## Capabilities

### New Capabilities
- `documentation`: Defines Itemized's single-source Markdown documentation under `docs/`, generated static docs website, offline in-app Help view and contextual Help panel, screen registry, user guide, self-hosting handbook, configuration reference, verified API reference, contributor guide, automated screenshot capture, WCAG 2.2 AA accessibility, and CI drift checks.

### Modified Capabilities
<!-- None: all existing capabilities remain unchanged at the spec level; this change introduces the documentation system and its in-app Help surfaces under the new `documentation` capability. -->

## Impact

- **Documentation & Build Tooling**: Adds `docs/` Markdown tree, `Makefile`, `CONTRIBUTING.md`, docs generator/checker scripts (Node/TypeScript), and automated screenshot + WCAG 2.2 AA check scripts (Playwright + axe-core).
- **Frontend (`web/`)**: Adds `/help` route, lazy-loaded generated help bundle (`web/src/generated/help/`), Help landing/article view, contextual Help drawer/sheet, shared keyboard shortcut table (`web/src/shortcuts.ts`), screen ID registry (`web/src/screens.ts`), Help buttons in `Layout`, `SettingsPage`, and modals/drawers, plus unit tests.
- **Backend (`internal/`, `cmd/`)**: Adds Go documentation verification tests (environment variable coverage, API error code & executed example tests against an in-process `api.Server`, and `internal/` package map check). No runtime API breaking changes.
- **CI (`.github/workflows/`)**: Extends CI to run docs build/staleness check, link/anchor/front-matter/capability/screen checks, Go drift tests, and automated WCAG 2.2 AA accessibility checks; builds the static docs website bundle without committing generated website HTML to git.

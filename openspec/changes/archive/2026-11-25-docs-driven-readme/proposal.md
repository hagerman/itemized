# Proposal

## Why

`README.md` currently duplicates configuration tables, Docker quick-start snippets, feature summaries, and a single manually captured legacy screenshot (`docs/screenshot-inventory.jpg`), so it drifts whenever `docs/` or the UI changes. Maintaining `README.md` directly from the single documentation source under `docs/` and replacing the legacy screenshot with curated automated screenshots from `docs/assets/` keeps the repository landing page accurate, visual, and verified in CI.

## What Changes

- Generate `README.md` deterministically from `docs/` as part of the existing docs build pipeline (`make docs-build` / `npm run docs:build`), deriving:
  - Feature highlights and documentation navigation links from `docs/` front matter (`title`, `summary`, and paths across user, self-hosting, API, and contributor guides).
  - Quick Start snippets (Docker Compose and Docker Run) from `docs/self-hosting/docker-compose.md` and `docs/self-hosting/docker-run.md`.
  - The Configuration environment variable table from `docs/self-hosting/configuration.md` (with relative links rewritten for the repository root), keeping it automatically in sync with the Go-verified configuration reference.
  - Self-hosting platform links (including Unraid and Single Binary) from `docs/self-hosting/README.md`.
  - Development, Security (`SECURITY.md`), and License (`LICENSE` / AGPL-3.0) sections.
- Replace the legacy `docs/screenshot-inventory.jpg` in `README.md` with curated automated screenshots from `docs/assets/`:
  - Hero screenshot: `docs/assets/inventory.png`.
  - Curated screenshot showcase highlighting key workflows: `docs/assets/scanner.png`, `docs/assets/shopping-list.png`, `docs/assets/product-detail.png`, `docs/assets/settings-printers.png`, and `docs/assets/mobile-pwa.png`.
- Remove the obsolete `docs/screenshot-inventory.jpg` asset once replaced.
- Extend `web/scripts/docs/check.ts` (`make docs-check`) to verify that `README.md` is up to date with `docs/`, that every image and relative link in `README.md` resolves (with images sourced from `docs/assets/` or `web/public/`), and that brand capitalization rules (`itemized`) hold in `README.md`.

## Capabilities

### New Capabilities
<!-- No new capabilities; extends the existing documentation capability. -->

### Modified Capabilities
- `documentation`: Extend the single-source documentation system so `README.md` is generated from `docs/`, uses curated automated screenshots from `docs/assets/` instead of a manual legacy screenshot, and is checked for staleness, broken links/images, and brand capitalization by `docs-check`.

## Impact

- `web/scripts/docs/build.ts` (and/or a new helper module under `web/scripts/docs/readme.ts`): adds deterministic `README.md` generation from parsed `docs/` files.
- `web/scripts/docs/check.ts`: adds `README.md` staleness, image/link resolution, and brand capitalization checks.
- `web/src/docs-check.test.ts`: adds unit tests covering `README.md` generation and staleness/broken-image detection.
- `README.md`: updated to the docs-generated output with curated screenshots from `docs/assets/`.
- `docs/screenshot-inventory.jpg`: removed.
- No runtime Go or React application code changes.

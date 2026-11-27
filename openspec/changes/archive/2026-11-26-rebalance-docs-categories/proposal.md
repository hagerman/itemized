# Proposal

## Why

The **Use itemized** documentation entry point currently holds 11 of 27 total pages (41% of the site), mixing core daily household workflows with hardware/service integrations, account management, settings, and troubleshooting—while **Integrate** and **Reference** hold only 1 page each. Splitting the user guide into two focused categories and merging **Integrate** and **Reference** restores a balanced, scannable 6-card landing grid and sidebar while keeping every category cohesive.

## What Changes

- Split **Use itemized** (`docs/use/`, 11 pages) into two user-facing entry points:
  - **Use itemized** (`use`, `docs/use/`, 6 pages): core daily household workflows (`inventory-and-expiration.md`, `locations-and-categories.md`, `barcode-scanning.md`, `variants-and-barcodes.md`, `shopping-list.md`, `search-and-shortcuts.md`).
  - **Configure & connect** (`configure`, `docs/configure/`, 5 pages): hardware, external services, accounts, settings, and troubleshooting (`label-printing.md`, `upc-and-ai.md`, `accounts-and-sso.md`, `settings.md`, `troubleshooting.md`).
- **BREAKING**: Move the 5 reassigned user-guide Markdown files from `docs/use/` to `docs/configure/`, changing their static website URLs (`/use/*.html` → `/configure/*.html`) and in-app Help slugs (`/help/use/*` → `/help/configure/*`).
- **BREAKING**: Merge the single-page **Integrate** (`integrate`) and **Reference** (`reference`) entry points into a single **API & reference** (`reference`) entry point covering `docs/api.md` and `docs/self-hosting/configuration.md` (keeping both source file paths unchanged so Go verification tests and external bookmarks remain intact).
- Update the in-app `/help` landing page grouping (`HelpPage.tsx`), task entry slugs (`build.ts`), README feature/showcase generation (`readme.ts`), internal Markdown cross-links, accessibility test routes (`a11y.ts`), and docs unit tests (`docs-check.test.ts`).
- Regenerate `web/src/generated/help/index.ts`, `README.md`, and the static docs website bundle (`dist/docs/`).

## Capabilities

### New Capabilities
<!-- None; this change modifies the existing documentation capability. -->

### Modified Capabilities
- `documentation`: Update the six documentation website entry points (`Get started`, `Use itemized`, `Configure & connect`, `Self-host`, `API & reference`, `Under the hood`), update the `docs/configure/label-printing.md` path in the single-source scenario, and group in-app `/help` user guides across `Get started`, `Use itemized`, and `Configure & connect`.

## Impact

- **Documentation source**: Move 5 Markdown files from `docs/use/` to `docs/configure/`, update their `entry_point` and `order` front matter, update `docs/api.md` `entry_point` from `integrate` to `reference`, and update relative links across `docs/`.
- **Docs build & verification**: `web/scripts/docs/lib.ts`, `web/scripts/docs/build.ts`, `web/scripts/docs/readme.ts`, `web/scripts/docs/a11y.ts`, `web/src/docs-check.test.ts`.
- **In-app Help UI**: `web/src/pages/HelpPage.tsx` and generated `web/src/generated/help/index.ts`.
- **Generated repository docs**: `README.md` (regenerated via `make docs-build`).
- **No Go code or database changes**; `docs/api.md` and `docs/self-hosting/configuration.md` stay at their current paths so `internal/docsverify` tests continue to pass unchanged.

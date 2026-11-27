# Design

## Context

See `proposal.md` for motivation. The docs build pipeline (`web/scripts/docs/lib.ts`, `build.ts`, `check.ts`, `readme.ts`, `a11y.ts`) derives sidebar navigation, section index pages (`/docs/<entry_point>/index.html`), landing page cards, in-app `/help` pages (`web/src/generated/help/index.ts`), and `README.md` from Markdown front matter under `docs/`.

`internal/docsverify` tests validate `docs/api.md` and `docs/self-hosting/configuration.md` at their current paths, while `web/scripts/docs/check.ts` validates relative Markdown links, heading anchors, screen coverage, capability coverage, brand capitalization, and README/Help staleness.

## Goals / Non-Goals

**Goals:**
- Rebalance the six documentation entry points so every category has a clear user/operator purpose and 2–6 pages (removing the 11-page `Use itemized` bottleneck and the two 1-page categories).
- Keep the `docs/` directory layout aligned with the two user-guide categories (`docs/use/` and `docs/configure/`) so URLs and Help slugs match their entry points.
- Preserve all existing contextual Help screen mappings, capability coverage, README showcase/feature bullets, and WCAG 2.2 AA compliance.

**Non-Goals:**
- Rewriting guide prose or changing the 600-word user guide limit or screenshot-first rule.
- Moving `docs/api.md` or `docs/self-hosting/configuration.md` out of their current file paths (avoiding unnecessary churn in `internal/docsverify` and external bookmarks).
- Adding HTTP redirects for old static `/use/*.html` URLs (static bundle deployment has no server-side redirect layer; internal links and Help slugs are updated in-place).

## Decisions

### 1. Entry point taxonomy and page assignment
Replace `integrate` with `configure` and rename `reference` to **API & reference**, keeping six entry points for a balanced 3×2 landing page grid:

| Order | Entry point ID | Title | Description | Pages (count) |
| :---: | --- | --- | --- | --- |
| 1 | `get-started` | Get started | Set up itemized, try the live demo, and install the mobile PWA. | `docs/get-started/{getting-started,install-pwa,demo-mode}.md` (3) |
| 2 | `use` | Use itemized | Daily workflows for inventory, locations, barcode scanning, variants, shopping lists, and search. | `docs/use/{inventory-and-expiration,locations-and-categories,barcode-scanning,variants-and-barcodes,shopping-list,search-and-shortcuts}.md` (6) |
| 3 | `configure` | Configure & connect | Set up Zebra label printing, UPC/AI classification, household accounts and OIDC SSO, settings, and troubleshooting. | `docs/configure/{label-printing,upc-and-ai,accounts-and-sso,settings,troubleshooting}.md` (5) |
| 4 | `self-host` | Self-host | Install with Docker, Unraid, or a single binary, configure TLS, and run backup drills. | `docs/self-hosting/{README,docker-compose,docker-run,unraid,binary}.md` (5) |
| 5 | `reference` | API & reference | Automate workflows with the HTTP API and look up every environment variable. | `docs/api.md` (order 1), `docs/self-hosting/configuration.md` (order 2) (2) |
| 6 | `under-the-hood` | Under the hood | System architecture, internal Go packages, OpenSpec workflow, and contributing guides. | `docs/architecture.md`, `docs/contributing/*.md` (6) |

- **Alternatives considered**:
  - *Rebalancing into existing `Integrate` + `Reference`*: Moves user-facing guides (`audience: user`) like Label printing, Settings, and Troubleshooting into developer/admin-sounding categories, which feels awkward in both the website and `/help`.
  - *Keeping 11 pages in `Use itemized` with sub-groups*: Leaves `Integrate` and `Reference` at 1 page each and hides 7 pages on the landing page card.

### 2. Move the 5 reassigned user-guide files to `docs/configure/`
Move `label-printing.md`, `upc-and-ai.md`, `accounts-and-sso.md`, `settings.md`, and `troubleshooting.md` from `docs/use/` to `docs/configure/`, updating their front matter (`entry_point: configure`, sequential `order: 1..5`) and renumbering `docs/use/` `order: 1..6`.

- Because `docs/configure/*.md` is at the same directory depth as `docs/use/*.md`, relative asset paths (`../assets/*.png`) and links to `../self-hosting/*.md` remain valid unchanged.
- Cross-links between `docs/use/` and `docs/configure/` (e.g., `docs/use/barcode-scanning.md` → `../configure/upc-and-ai.md`, `docs/configure/settings.md` → `../use/inventory-and-expiration.md`, `docs/get-started/getting-started.md` → `../configure/accounts-and-sso.md`, `docs/self-hosting/README.md` & `configuration.md` → `../configure/*.md`) are updated and verified by `make docs-check`.
- `docs/api.md` keeps its file path and only updates `entry_point: reference` (order 1), while `docs/self-hosting/configuration.md` updates `order: 2` under `entry_point: reference`.

### 3. In-app `/help` and `README.md` integration
- `web/src/pages/HelpPage.tsx`: Extend `ENTRY_LABELS` and `grouped` from `["get-started", "use"]` to `["get-started", "use", "configure"]` so all `audience: "user"` pages appear under their matching category on `/help`.
- `web/scripts/docs/build.ts`: Update `HELP_TASK_ENTRIES` slug `"use/label-printing"` → `"configure/label-printing"`. Contextual Help (`HELP_SCREEN_MAP`) is auto-generated from each page's `screens:` front matter and `slug`, so moving the files automatically updates `settings/printers`, `settings/label-templates`, `settings/llm`, `dialog/reclassify-products`, `settings/account`, `settings/oidc`, `settings/users`, and `settings` without manual mapping edits.
- `web/scripts/docs/readme.ts`: Update `DESKTOP_SHOWCASE` (`use/label-printing.md` → `configure/label-printing.md`) and include both `use/` and `configure/` guides (excluding `configure/troubleshooting.md`, ordered `use` then `configure`) in the `What itemized does` feature bullets so README coverage does not regress.

## Risks / Trade-offs

- **[Breaking static URLs & deep links]** Moving 5 files from `docs/use/` to `docs/configure/` changes `/docs/use/<page>.html` to `/docs/configure/<page>.html` and `/help/use/<page>` to `/help/configure/<page>`. → Mitigation: Update all internal links, `a11y.ts` routes, `build.ts` task entries, `readme.ts` showcase links, and run `make docs-check` to catch any remaining broken links or stale generated files.
- **[Brand capitalization check]** New entry point titles and descriptions must obey lowercase `itemized` mid-sentence. → Mitigation: `Configure & connect` and `API & reference` contain no brand name; `Use itemized` and all descriptions use lowercase `itemized` and are verified by `make docs-check`.

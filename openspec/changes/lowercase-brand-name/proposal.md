# Proposal

## Why

`itemized-website` defines an explicit brand capitalization rule (`site-chrome-and-design`: render `itemized` in lowercase everywhere—wordmarks, titles, metadata, labels, and mid-sentence copy—except when `Itemized` is the first word of a sentence), whereas the `itemized` app, PWA metadata, `README.md`, `CONTRIBUTING.md`, and `docs/` still use title-cased `Itemized` in titles, labels, and mid-sentence prose. Aligning `itemized` with the same rule ensures a consistent brand identity across the app, PWA home-screen install, in-app Help, repository docs, and `itemizedapp.com/docs/`.

## What Changes

- **Web UI & PWA metadata (`web/`)**: Render the brand name as lowercase `itemized` in `<title>`, `apple-mobile-web-app-title`, `manifest.json` (`name` and `short_name`), loading screens, camera HTTPS error messages, and UI labels, capitalizing `Itemized` only when it begins a sentence. Update `pwa.test.ts`, `Scanner.test.tsx`, and `HelpPage.test.tsx` to verify the lowercase rule.
- **Documentation source & generated outputs (`docs/`, `web/scripts/docs/`, `README.md`, `CONTRIBUTING.md`)**:
  - Update entry point titles (`Use itemized`), Help landing task entries (`Install itemized on your phone`, `Self-host itemized`), static docs landing/footer headings (`itemized documentation`), and all Markdown copy under `docs/`, `README.md`, and `CONTRIBUTING.md` so `itemized` is lowercase everywhere except at the start of a sentence.
  - Add an automated brand-casing check to `web/scripts/docs/check.ts` (`make docs-check`) that fails CI if non-sentence-start `Itemized` appears in `docs/` Markdown or generated static docs HTML (matching `itemized-website`'s `scripts/checks/seo.mjs`).

## Capabilities

### New Capabilities
<!-- None: this change extends existing web-ui and documentation capabilities with brand capitalization rules. -->

### Modified Capabilities
- `web-ui`: Add brand name capitalization requirement covering HTML `<title>`, PWA manifest (`name`, `short_name`), iOS home-screen meta tag, and in-app UI copy.
- `documentation`: Add brand name capitalization requirement and automated `docs-check` enforcement, and update the `Documentation website` entry point (`Use itemized`) and `Help landing page` task entry labels (`Install itemized on your phone`, `Self-host itemized`).

## Impact

- **Frontend (`web/`)**: `web/index.html`, `web/public/manifest.json`, `web/src/App.tsx`, `web/src/components/BarcodeScanner.tsx`, `web/src/pages/HelpPage.tsx`, `web/src/generated/help/index.ts`, and unit tests (`pwa.test.ts`, `Scanner.test.tsx`, `HelpPage.test.tsx`).
- **Docs & Tooling (`docs/`, `web/scripts/docs/`)**: `web/scripts/docs/lib.ts`, `web/scripts/docs/build.ts`, `web/scripts/docs/check.ts`, `web/src/docs-check.test.ts`, `docs/**/*.md`, `README.md`, and `CONTRIBUTING.md`.
- **Cross-repo benefit**: Generated `dist/docs/` HTML will satisfy `itemized-website`'s `seo.mjs` brand-casing check natively without needing a `/docs/` exemption.

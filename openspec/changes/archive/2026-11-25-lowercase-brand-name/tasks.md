# Tasks

## 1. Web UI & PWA Metadata Brand Casing

- [x] 1.1 Update `web/index.html` (`<title>`, `apple-mobile-web-app-title`), `web/public/manifest.json` (`name`, `short_name`), `web/src/App.tsx` (`Loading itemized...`), `web/src/components/BarcodeScanner.tsx` (`Access itemized over HTTPS...`), and `web/src/pages/HelpPage.tsx` (`Use itemized`) to render lowercase `itemized` everywhere except sentence starts; update `web/src/pwa.test.ts`, `web/src/components/Scanner.test.tsx`, and `web/src/pages/HelpPage.test.tsx` to assert lowercase brand casing and verify via `cd web && npm test`.

## 2. Documentation Builder, Checker, and Markdown Copy

- [x] 2.1 Update `web/scripts/docs/lib.ts` (`ENTRY_POINTS` titles and descriptions) and `web/scripts/docs/build.ts` (`HELP_TASK_ENTRIES`, landing `<h1>`, meta descriptions, and footer text) to use lowercase `itemized` except at sentence starts; verify `make docs-build` regenerates `dist/docs/` and `web/src/generated/help/index.ts`.
- [x] 2.2 Add automated brand-casing validation to `web/scripts/docs/check.ts` that fails on non-sentence-start `Itemized` in `docs/` Markdown (stripping fenced code blocks and inline code) and generated static site HTML, and add a unit test in `web/src/docs-check.test.ts` verifying mid-sentence `Itemized` is rejected while sentence-start `Itemized` is allowed; verify via `cd web && npx vitest run src/docs-check.test.ts`.
- [x] 2.3 Update all authored Markdown under `docs/**/*.md`, `README.md`, and `CONTRIBUTING.md` so `itemized` is lowercase everywhere except when `Itemized` is the first word of a sentence, then run `make docs-build && make docs-check` to confirm zero brand-casing or staleness errors.

## 3. Full Verification

- [x] 3.1 Run full verification: `go test ./...`, `go vet ./...`, `gopls check` on all Go files (resolving `gopls` from `PATH` or `$(go env GOPATH)/bin/gopls`), `cd web && npm test && npm run build`, `make docs-check`, and `make docs-a11y`, fixing any reported diagnostics.

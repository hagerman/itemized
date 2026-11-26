# Tasks

## 1. Docs-driven README generator

- [x] 1.1 Create `web/scripts/docs/readme.ts` exporting `generateReadmeContent(docs, root)` that derives feature summaries/links from `docs/` front matter, Quick Start snippets from `docs/self-hosting/docker-compose.md` and `docs/self-hosting/docker-run.md`, the Configuration table from `docs/self-hosting/configuration.md` (with links rewritten for the repo root), self-hosting platform links from `docs/self-hosting/README.md`, curated screenshots from `docs/assets/` (`inventory.png` hero plus workflow gallery including `scanner.png`, `shopping-list.png`, `product-detail.png`, `settings-printers.png`, and `mobile-pwa.png`), and Development/Security/License sections; verify with unit tests in `web/src/docs-check.test.ts` that `generateReadmeContent` extracts snippets, rewrites links, and emits expected `docs/assets/` images.
- [x] 1.2 Wire `generateReadmeContent` into `buildAllDocs()` in `web/scripts/docs/build.ts` so `make docs-build` writes `<root>/README.md` alongside the static docs site and in-app Help bundle, and verify `cd web && npm run docs:build` succeeds and regenerates `README.md`.

## 2. README validation in docs-check

- [x] 2.1 Extend `checkDocs()` in `web/scripts/docs/check.ts` to verify `README.md` freshness against `generateReadmeContent` (when `checkStaleness` is enabled), check that all `<img src>` and Markdown images in `README.md` exist on disk with non-empty alt text, verify relative links and heading anchors into `docs/`, and enforce brand capitalization (`itemized`) in `README.md`; add unit tests in `web/src/docs-check.test.ts` covering stale `README.md`, missing image/alt text, broken links, and non-sentence-start `Itemized`, and verify `cd web && npm test` passes.

## 3. Regenerate README and clean up legacy screenshot

- [x] 3.1 Run `make docs-build` to regenerate `README.md` from `docs/`, delete the obsolete `docs/screenshot-inventory.jpg`, inspect the generated `README.md` for clean GitHub Markdown rendering and accurate links/screenshots, and verify `make docs-check` passes with zero errors.

## 4. Integration verification

- [x] 4.1 Run full repository checks (`make check`, `go test ./...`, `go vet ./...`, and `gopls check` on Go files) and verify all checks and tests pass.

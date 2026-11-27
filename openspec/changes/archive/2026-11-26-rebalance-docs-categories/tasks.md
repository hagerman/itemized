# Tasks

## 1. Documentation taxonomy and file moves

- [x] 1.1 Update `EntryPointId` and `ENTRY_POINTS` in `web/scripts/docs/lib.ts` to the six balanced entry points (`get-started`, `use`, `configure`, `self-host`, `reference` titled `API & reference`, `under-the-hood`) and verify TypeScript compiles with `cd web && npx tsc --noEmit`
- [x] 1.2 Move `label-printing.md`, `upc-and-ai.md`, `accounts-and-sso.md`, `settings.md`, and `troubleshooting.md` from `docs/use/` to `docs/configure/`, update their front matter (`entry_point: configure`, sequential `order: 1..5`), renumber remaining `docs/use/` guides (`order: 1..6`), and update `docs/api.md` (`entry_point: reference`, `order: 1`) and `docs/self-hosting/configuration.md` (`order: 2`); verify all 27 Markdown files exist at their expected paths with valid front matter
- [x] 1.3 Update relative Markdown cross-links referencing the moved files across `docs/use/barcode-scanning.md`, `docs/configure/settings.md`, `docs/get-started/getting-started.md`, `docs/self-hosting/README.md`, and `docs/self-hosting/configuration.md`, and verify zero broken links remain via `grep -rn "use/\(label-printing\|upc-and-ai\|accounts-and-sso\|settings\|troubleshooting\)" docs/`

## 2. Docs build, README generator, in-app Help, and tests

- [x] 2.1 Update `HELP_TASK_ENTRIES` in `web/scripts/docs/build.ts` (`use/label-printing` → `configure/label-printing`) and `web/src/pages/HelpPage.tsx` (`ENTRY_LABELS` and `grouped` to include `configure: "Configure & connect"`), and verify `cd web && npx tsc --noEmit` passes
- [x] 2.2 Update `web/scripts/docs/readme.ts` (`DESKTOP_SHOWCASE` `use/label-printing.md` → `configure/label-printing.md` and feature bullets to include both `docs/use/*.md` and `docs/configure/*.md` excluding `configure/troubleshooting.md`, ordered `use` then `configure`) and update `web/src/docs-check.test.ts` to cover `configure` and `reference` entry points; verify with `cd web && npm test -- src/docs-check.test.ts`
- [x] 2.3 Update `web/scripts/docs/a11y.ts` static and in-app Help routes (`/use/label-printing.html` → `/configure/label-printing.html`, `/help/use/label-printing` → `/help/configure/label-printing`, plus `/configure/index.html`) and verify TypeScript compiles cleanly

## 3. Regenerate artifacts and full verification

- [x] 3.1 Run `make docs-build` and `make docs-check` to regenerate `dist/docs/`, `web/src/generated/help/index.ts`, and `README.md`, confirming all link, anchor, word-count, brand-casing, screen-coverage, capability-coverage, and freshness checks pass
- [x] 3.2 Run `cd web && npm test` and verify all frontend unit tests pass (including HelpPage and docs-check suites)
- [x] 3.3 Run `go test ./...`, `go vet ./...`, and `gopls check` on Go files (resolving `gopls` from `PATH` or `$(go env GOPATH)/bin/gopls`) and verify zero failures or diagnostics

# Tasks

## 1. Document AI-assisted development and OpenSpec benefits

- [x] 1.1 Add an **AI-assisted development & why itemized uses OpenSpec** section to `docs/contributing/openspec.md` explaining AI usage in the development cycle, human oversight, and the benefits of spec-driven development with OpenSpec (spec-first clarity, durable living specs, and automated verification gates); verify `make docs-check` passes with no brand-casing or link errors.
- [x] 1.2 Add a concise **AI-Assisted Development & OpenSpec** section to `web/scripts/docs/readme.ts` (linking to `docs/contributing/openspec.md`), add a brief pointer in `CONTRIBUTING.md`, regenerate `README.md` and `web/src/generated/help/` via `make docs-build`, and verify `README.md` renders cleanly and passes `make docs-check`.

## 2. Verification

- [x] 2.1 Run full repository checks (`make check`, `go test ./...`, `go vet ./...`, and `gopls check` on Go files) and verify all checks and tests pass.

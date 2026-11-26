# Proposal

## Why

Users and contributors evaluating or contributing to itemized should have clear, upfront transparency about how AI coding assistants are used in the development cycle—and how pairing AI development with **OpenSpec** and automated verification keeps changes intentional, well-specified, and reliable.

## What Changes

- Expand `docs/contributing/openspec.md` with an **AI-assisted development & why itemized uses OpenSpec** section that:
  - Discloses transparently that AI coding assistants are used across the development cycle (drafting proposals, specs, code, tests, and documentation) under human direction, review, and verification.
  - Explains the concrete benefits of OpenSpec in this workflow: spec-first planning (`proposal.md`, delta specs, `design.md`, `tasks.md`) before writing code, living behavioral specifications in `openspec/specs/` that keep humans and AI agents aligned, and automated quality gates (`make check`, Go/Vitest tests, API contract tests, docs freshness/coverage checks, and WCAG 2.2 AA checks).
- Add a concise **AI-Assisted Development & OpenSpec** disclosure section to the generated `README.md` (via `web/scripts/docs/readme.ts`, pulling/linking directly to `docs/contributing/openspec.md`) so visitors see it right on the repository landing page.
- Add a brief note to `CONTRIBUTING.md` referencing the AI-assisted development and OpenSpec workflow expectations.

## Capabilities

### New Capabilities
<!-- None; documentation/transparency addition only (skip_specs: true). -->

### Modified Capabilities
<!-- None; no spec-level system behavior changes (skip_specs: true). -->

## Impact

- `docs/contributing/openspec.md`: expanded with the AI development disclosure and OpenSpec benefits.
- `web/scripts/docs/readme.ts`: adds the concise **AI-Assisted Development & OpenSpec** section to generated `README.md` (linking to `docs/contributing/openspec.md`).
- `CONTRIBUTING.md`: adds a brief pointer to the AI-assisted & OpenSpec development guidelines.
- `README.md` and `web/src/generated/help/`: regenerated via `make docs-build`.
- No runtime Go or React application code changes.

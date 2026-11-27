---
title: OpenSpec workflow
summary: How itemized uses AI-assisted development and OpenSpec to specify behavior before implementing changes.
audience: developer
entry_point: under-the-hood
order: 4
capabilities:
  - web-ui
screens: []
---

Itemized tracks durable system behavior in `openspec/specs/` and active proposals in `openspec/changes/`.

## AI-assisted development & why itemized uses OpenSpec

AI coding assistants are actively used throughout the itemized development cycle—helping draft proposals, specifications, code, tests, and documentation—under human direction, architectural review, and verification.

Rather than relying on ad-hoc prompts, itemized pairs AI-assisted development with **OpenSpec** for three key benefits:

- **Spec-first clarity**: Every non-trivial change starts with a written `proposal.md`, testable behavioral spec deltas, optional `design.md`, and an ordered `tasks.md` checklist before code is written. This prevents scope creep and ensures intent is agreed upon up front.
- **Durable living specifications**: When a change is archived, its spec deltas merge into `openspec/specs/`. Both human readers and AI agents can work from the same up-to-date behavioral contract instead of reverse-engineering intent from scattered code or old commits.
- **Automated verification**: Every change—human-written or AI-assisted—is gated by `make check` (Go vet and tests, API documentation contract tests, frontend Vitest tests, documentation freshness/link/coverage checks) and WCAG 2.2 AA accessibility checks.

## Directory layout

- `openspec/specs/<capability>/spec.md`: Authoritative behavioral specifications for each capability. Every capability here must be covered by at least one page under `docs/` (enforced by `make docs-check`).
- `openspec/changes/<change-name>/`: In-flight changes containing `proposal.md`, `specs/<capability>/spec.md`, `design.md`, and `tasks.md`.
- `openspec/config.yaml`: Project-wide OpenSpec rules (including Go verification requirements).

## Standard workflow

1. **Propose**: Create a new change (`openspec new change "<name>"`) with `proposal.md`, spec delta(s), `design.md`, and `tasks.md`.
2. **Validate**: Run `openspec validate "<name>"` to confirm the spec delta format and requirements are valid.
3. **Apply**: Work through `tasks.md` in order, checking off completed tasks and running `make check` as you go.
4. **Archive**: Once implementation and tests pass, archive the change to merge its spec deltas into `openspec/specs/`.

When a new capability is added to `openspec/specs/`, add it to the `capabilities:` front matter of the relevant guide under `docs/` and run `make docs-build` followed by `make docs-check`.

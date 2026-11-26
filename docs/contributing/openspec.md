---
title: OpenSpec workflow
summary: How itemized uses OpenSpec to specify behavior before implementing changes.
audience: developer
entry_point: under-the-hood
order: 4
capabilities:
  - web-ui
screens: []
---

Itemized tracks durable system behavior in `openspec/specs/` and active proposals in `openspec/changes/`.

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

# Contributing to itemized

Thank you for your interest in contributing to itemized!

Our full contributor documentation lives under `docs/contributing/`:

- [First contribution](docs/contributing/first-contribution.md) — set up your local environment and land a change in 30 minutes.
- [Architecture tour](docs/contributing/architecture-tour.md) — follow one scan/purchase action from React through the Go API and SQLite and back.
- [Architecture overview](docs/architecture.md) — system design and top-level Go package table.
- [Package map](docs/contributing/packages.md) — every Go package under `internal/` and what it reads and writes.
- [OpenSpec workflow](docs/contributing/openspec.md) — how itemized uses AI-assisted development and OpenSpec to propose, apply, and archive changes.
- [Tests and checks](docs/contributing/tests-and-checks.md) — Go tests, frontend Vitest suite, docs checks, and WCAG 2.2 AA checks.

AI-assisted contributions are welcome when paired with clear OpenSpec specifications, human review, and passing checks. Before opening a pull request, run `make check` to verify documentation, Go tests, and frontend tests.

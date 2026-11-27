# Contributing to itemized

Thank you for your interest in itemized!

## Open source, not open contribution

itemized is **open source** under the [GNU Affero General Public License v3.0 (AGPL-3.0)](LICENSE)—anyone is free to self-host, audit, modify, and fork it.

However, itemized is **not open to external code contributions**. The project is solo-maintained using a spec-driven [OpenSpec](docs/contributing/openspec.md) workflow, and keeping a single copyright holder preserves architectural coherence and clean licensing for future hosted services. **Unsolicited pull requests will be closed without review.**

### How you can help

- **Bug reports**: Open a [GitHub Issue](https://github.com/itemizedapp/itemized/issues) with reproduction steps, environment details, and relevant logs.
- **Feature ideas**: Open a [GitHub Issue](https://github.com/itemizedapp/itemized/issues) describing the use case and problem you want to solve.
- **Security vulnerabilities**: Please report privately following [SECURITY.md](SECURITY.md).
- **Forks**: If you need custom behavior right away, you are always welcome to fork itemized under the terms of the AGPL-3.0 license.

## Developer & architecture documentation

If you are building from source, exploring how itemized works, or maintaining a fork, the developer documentation lives under `docs/contributing/`:

- [Local development setup](docs/contributing/first-contribution.md) — set up your local environment, run tests, and build from source.
- [Architecture tour](docs/contributing/architecture-tour.md) — follow one scan/purchase action from React through the Go API and SQLite and back.
- [Architecture overview](docs/architecture.md) — system design and top-level Go package table.
- [Package map](docs/contributing/packages.md) — every Go package under `internal/` and what it reads and writes.
- [OpenSpec workflow](docs/contributing/openspec.md) — how itemized uses AI-assisted development and OpenSpec to propose, apply, and archive changes.
- [Tests and checks](docs/contributing/tests-and-checks.md) — Go tests, frontend Vitest suite, docs checks, and WCAG 2.2 AA checks.

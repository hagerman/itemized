---
title: Tests and checks
summary: Commands to run Go tests, frontend Vitest tests, docs verification, screenshots, and WCAG 2.2 AA accessibility checks.
audience: developer
entry_point: under-the-hood
order: 5
capabilities:
  - documentation
  - web-ui
screens: []
---

Every pull request is verified automatically in GitHub Actions. You can run the same checks locally using the repository `Makefile`.

## Primary commands

| Command | What it runs |
| --- | --- |
| `make test` | `go vet ./...`, `go test ./...` (including `internal/docsverify`), and `cd web && npm test` |
| `make build` | Production React build (`tsc --noEmit && vite build`) and embedded Go binary (`go build ./cmd/itemized`) |
| `make docs-build` | Builds the static docs site (`dist/docs/`) and regenerates `web/src/generated/help/` |
| `make docs-check` | Validates front matter, links, anchors, images, word counts, capability coverage, screen coverage, and help staleness |
| `make docs-screenshots` | Boots a temporary `DEMO_MODE=true` server and captures user guide screenshots into `docs/assets/` |
| `make docs-a11y` | Runs Playwright + axe-core WCAG 2.2 AA checks on `dist/docs/` and in-app `/help` |
| `make check` | Runs `make docs-check` and `make test` together |

## Go drift tests

`go test ./...` automatically runs `internal/docsverify`, which checks:

- Every environment variable read by `cmd/`, `internal/`, and `docker-entrypoint.sh` is documented in [Configuration reference](../self-hosting/configuration.md).
- Every executable HTTP example and error response in [API reference](../api.md) matches the live `internal/api` server.
- Every package under `internal/` is documented in [Package map](packages.md) and [Architecture overview](../architecture.md), and every `make <target>` named under `docs/contributing/` exists in `Makefile`.

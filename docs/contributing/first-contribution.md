---
title: First contribution
summary: Set up your local itemized development environment and submit your first pull request in 30 minutes.
audience: developer
entry_point: under-the-hood
order: 2
capabilities:
  - web-ui
screens: []
---

This walkthrough takes you from cloning the repository to running tests and opening your first pull request in about 30 minutes.

## Prerequisites

- **Go 1.26+**
- **Node.js 22+** and `npm`
- **Make**

## 1. Clone and install dependencies

```bash
git clone https://github.com/itemizedapp/itemized.git
cd itemized
cd web && npm ci && cd ..
```

## 2. Run the app locally

Start the Go backend in demo mode with a temporary database:

```bash
DEMO_MODE=true DB_PATH=/tmp/itemized-demo.db go run ./cmd/itemized
```

Open `http://localhost:8080` to interact with the seeded household inventory. For frontend hot-reload, run `cd web && npm run dev` alongside the Go server.

## 3. Make a small change and run checks

1. Review [Architecture overview](../architecture.md) and [Package map](packages.md) to locate the files for your change.
2. Make your edits and add unit tests covering the new or changed behavior.
3. If you added a route, Settings section, environment variable, API endpoint, or `internal/` package, update the corresponding Markdown page under `docs/` and run `make docs-build`.
4. Run `make check` to execute documentation checks, `go vet ./...`, `go test ./...`, and frontend tests.
5. Run `make build` to verify the production React bundle and embedded Go binary compile cleanly.

## 4. Open a pull request

Push your branch and open a pull request on GitHub describing what changed and how you verified it.

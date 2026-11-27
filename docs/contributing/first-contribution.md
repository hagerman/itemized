---
title: Local development setup
summary: Set up your local itemized development environment, run checks, and build from source.
audience: developer
entry_point: under-the-hood
order: 2
capabilities:
  - web-ui
screens: []
---

This walkthrough takes you from cloning the repository to running itemized locally, verifying tests, and building a production binary.

> **Contribution policy:** itemized is open source (AGPL-3.0), not open contribution—external pull requests are not accepted. Bug reports and feature ideas are always welcome via [GitHub Issues](https://github.com/itemizedapp/itemized/issues), and you are free to build from source or maintain your own fork.

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

## 3. Explore, modify, and run checks

1. Review [Architecture overview](../architecture.md) and [Package map](packages.md) to locate the files for any area you want to inspect or customize in a fork.
2. If you add or modify a route, Settings section, environment variable, API endpoint, or `internal/` package, update the corresponding Markdown page under `docs/` and run `make docs-build`.
3. Run `make check` to execute documentation checks, `go vet ./...`, `go test ./...`, and frontend tests.
4. Run `make build` to verify the production React bundle and embedded Go binary compile cleanly.

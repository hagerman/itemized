# Proposal

## Why

The GitHub Actions `test` job in `.github/workflows/docker-publish.yml` fails on clean checkouts with `web/embed.go:8:12: pattern all:dist: no matching files found` because `go vet ./...` and `go test ./...` run before the frontend build generates the gitignored `web/dist/` directory.

## What Changes

- Reorder steps in the `test` job of `.github/workflows/docker-publish.yml` so Node.js setup and `npm ci && npm test && npm run build` (producing `web/dist/`) run **before** `go vet ./...` and `go test ./...`.

## Capabilities

### New Capabilities

*(none — CI tooling fix only; `skip_specs: true`)*

### Modified Capabilities

*(none — no spec-level behavior changes)*

## Impact

- `.github/workflows/docker-publish.yml`: Reorders frontend build/test steps ahead of Go vet/test steps in the `test` job.

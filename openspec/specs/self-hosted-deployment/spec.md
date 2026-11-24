# self-hosted-deployment Specification

## Purpose

Packages the Go server and embedded React frontend as a self-contained multi-architecture Docker image ready for homelab deployment and Unraid Community Apps.

## Requirements

### Requirement: Single-container embedded deployment
The application SHALL compile the React frontend into static assets embedded inside the Go server binary and run as a single container serving both the UI and API on one HTTP port (default `8080`).

#### Scenario: Container serves SPA and API from one port
- **WHEN** the container starts with a mounted `/data` volume
- **THEN** the server initializes `/data/itemized.db` (applying any pending schema migrations automatically), serves the React SPA at `/`, serves JSON endpoints at `/api/*`, and responds `200 OK` on `GET /up`

### Requirement: Multi-architecture container image and Unraid template
The repository SHALL include a multi-stage `Dockerfile` producing `linux/amd64` and `linux/arm64` images that execute the server as a non-root user with writable `/data` ownership, and an Unraid Community Apps XML template mapping port `8080`, persistent volume `/data`, and core environment variables (`BASE_URL`, `TZ`, `TRUST_PROXY`, optional OIDC/LLM settings).

#### Scenario: Data persists across container upgrades
- **WHEN** the container is recreated against the same `/data` bind mount
- **THEN** all SQLite inventory data, users, printers, and custom label templates remain intact

#### Scenario: Container runs as non-root user
- **WHEN** the container image is built and started with default settings
- **THEN** the `/usr/local/bin/itemized` process runs under a non-root UID/GID with write access to `/data`

# self-hosted-deployment Specification

## Purpose

Packages the Go server and embedded React frontend as a self-contained multi-architecture Docker image ready for homelab deployment and Unraid Community Apps.

## Requirements

### Requirement: Single-container embedded deployment
The application SHALL compile the React frontend into static assets embedded inside the Go server binary and run as a single container serving both the UI and API on one HTTP port (default `8080`).

#### Scenario: Container serves SPA and API from one port
- **WHEN** the container starts with a mounted `/data` volume
- **THEN** the server initializes `/data/itemized.db` (applying any pending schema migrations automatically), serves the React SPA at `/`, serves JSON endpoints at `/api/*`, and responds `200 OK` on `GET /up`

### Requirement: Multi-architecture container image
The repository SHALL include a multi-stage `Dockerfile` producing `linux/amd64` and `linux/arm64` images with a `PUID`/`PGID` privilege-drop entrypoint that ensures the data directory is writable and runs `/usr/local/bin/itemized` as a non-root user.

#### Scenario: Data persists across container upgrades
- **WHEN** the container is recreated against the same `/data` bind mount
- **THEN** all SQLite inventory data, users, printers, and custom label templates remain intact

#### Scenario: Container runs as non-root user
- **WHEN** the container is built and started with default settings against a fresh bind-mounted `/data` directory (including Unraid's `0755 nobody:users` directory)
- **THEN** the entrypoint ensures the database directory is owned by `PUID:PGID` and drops privileges so `/usr/local/bin/itemized` runs under a non-root UID/GID with write access to `/data`

#### Scenario: Explicit non-root Docker --user invocation remains supported
- **WHEN** the container is launched with an explicit non-root `--user <uid>:<gid>`
- **THEN** the entrypoint skips `chown` and privilege drop and executes `/usr/local/bin/itemized` directly under the provided UID/GID

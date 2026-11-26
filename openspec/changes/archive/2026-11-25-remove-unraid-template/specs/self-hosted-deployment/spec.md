# Spec Delta

## RENAMED Requirements

- FROM: `### Requirement: Multi-architecture container image and Unraid template`
- TO: `### Requirement: Multi-architecture container image`

## MODIFIED Requirements

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

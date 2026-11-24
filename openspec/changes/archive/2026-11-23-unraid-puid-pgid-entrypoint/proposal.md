# Proposal

## Why

On fresh Unraid installations, Unraid's Docker manager automatically creates the bind-mounted appdata directory (`/mnt/cache/appdata/itemized`) owned by `nobody:users` (`99:100`) with mode `0755`. Because the container currently hardcodes a static `USER itemized` (`1000:1000`), SQLite immediately fails on first run with `unable to open database file (14)` unless the user manually runs `chown` on the Unraid host.

## What Changes

- Add `su-exec` and a lightweight `docker-entrypoint.sh` script to the Alpine runtime stage in `Dockerfile` that:
  - Ensures the database directory (`dirname "$DB_PATH"`, defaulting to `/data`) exists and is owned by `${PUID}:${PGID}` (default `1000:1000`) when started as root, then drops privileges via `exec su-exec "${PUID}:${PGID}" /usr/local/bin/itemized "$@"`.
  - Skips `chown` and `su-exec` when the container is explicitly launched with a non-root `--user` (`id -u != 0`), executing `/usr/local/bin/itemized` directly so strict `runAsNonRoot` environments remain supported.
- Add `PUID` (default `99`) and `PGID` (default `100`) environment variables to `unraid/itemized.xml` so fresh Unraid installs work out of the box and create files matching Unraid's native `nobody:users` ownership.
- Update `README.md` to document `PUID` and `PGID` and remove the manual `chown` prerequisite for Unraid installs.

## Capabilities

### New Capabilities

*(none)*

### Modified Capabilities

- `self-hosted-deployment`: Support configurable `PUID`/`PGID` privilege-drop startup in the container entrypoint (with `99`/`100` defaults in the Unraid template) so fresh bind mounts work out of the box while `/usr/local/bin/itemized` still executes as a non-root user.

## Impact

- `Dockerfile`: Installs `su-exec`, copies `docker-entrypoint.sh`, sets default `PUID=1000` and `PGID=1000`, and uses `docker-entrypoint.sh` as `ENTRYPOINT`.
- `docker-entrypoint.sh`: New minimal POSIX `/bin/sh` entrypoint script.
- `unraid/itemized.xml`: Adds `PUID` (`99`) and `PGID` (`100`) variables.
- `README.md`: Documents `PUID` / `PGID` environment variables.

# Design

## Context

See `proposal.md` for the Unraid first-run permission failure (`unable to open database file (14)` when `/mnt/cache/appdata/itemized` is auto-created by Unraid as `0755 nobody:users` (`99:100`) while the container runs statically as `1000:1000`).

## Goals / Non-Goals

**Goals:**
- Make a fresh `docker run` on Unraid (with or without `PUID`/`PGID` explicitly set) succeed on the very first run with zero manual `chown` commands.
- Keep `/usr/local/bin/itemized` running as a non-root UID/GID (`PUID:PGID`) in production.
- Preserve compatibility with strict non-root orchestrators (`docker run --user ...`, Kubernetes `runAsNonRoot: true`).

**Non-Goals:**
- Adding s6-overlay or heavy init frameworks; a ~15-line POSIX `/bin/sh` script + Alpine's `su-exec` is sufficient and keeps the image minimal.

## Decisions

1. **Privilege-drop entrypoint with `su-exec` (`docker-entrypoint.sh`)**
   - Install `su-exec` via `apk add --no-cache ca-certificates tzdata su-exec` in `Dockerfile` Stage 3.
   - Remove the static `USER itemized` directive so the entrypoint can fix bind-mount ownership on startup when launched normally, then immediately drop privileges before `exec`ing `/usr/local/bin/itemized`.
   - Entrypoint logic:
     ```sh
     #!/bin/sh
     set -eu

     if [ "$(id -u)" = "0" ]; then
       PUID="${PUID:-1000}"
       PGID="${PGID:-1000}"
       DATA_DIR="$(dirname "${DB_PATH:-/data/itemized.db}")"
       mkdir -p "$DATA_DIR"
       chown -R "${PUID}:${PGID}" "$DATA_DIR"
       exec su-exec "${PUID}:${PGID}" /usr/local/bin/itemized "$@"
     fi

     exec /usr/local/bin/itemized "$@"
     ```
   - *Why `dirname "${DB_PATH:-/data/itemized.db}"`?* Handles both default `/data/itemized.db` and custom `DB_PATH` overrides without failing if `DB_PATH` is in a subdirectory of `/data`.
   - *Why check `[ "$(id -u)" = "0" ]`?* If a user passes `--user 1000:1000` or runs under Kubernetes `runAsNonRoot`, the script skips `chown`/`su-exec` and runs `itemized` directly.
   - *Why keep `PUID=1000` / `PGID=1000` as the image default and `99` / `100` in `unraid/itemized.xml`?* Even if an Unraid user runs a minimal `docker run` *without* `PUID`/`PGID` (like the user's test command), the entrypoint `chown`s `/data` to `1000:1000` and succeeds immediately; when installed via the Unraid template, `PUID=99` and `PGID=100` match Unraid's native `nobody:users` share permissions cleanly.

2. **Avoid `PUID=0` / `PGID=0` pitfalls**
   - `su-exec 99:100` works directly with numeric UID:GID without needing `/etc/passwd` entries for arbitrary UIDs (e.g., `99:100`, `1000:1000`, `1026:100` on Synology).

## Risks / Trade-offs

- **[Risk] Large `/data` directory `chown -R` on startup** → `/data` only stores the SQLite database (`itemized.db`, `-wal`, `-shm`), so `chown -R` takes milliseconds.
- **[Risk] Security scanners flagging missing `USER` in `Dockerfile`** → Standard trade-off for `PUID`/`PGID` self-hosted images (identical to LinuxServer.io, Immich, Paperless, etc.); the actual server process runs non-root via `su-exec`, and `--user` overrides remain fully supported.

# Tasks

## 1. Container Entrypoint & Dockerfile

- [x] 1.1 Create `docker-entrypoint.sh` (executable POSIX shell script) that ensures `dirname "${DB_PATH:-/data/itemized.db}"` exists, `chown -R "${PUID:-1000}:${PGID:-1000}"` when running as root, and drops privileges via `exec su-exec "${PUID}:${PGID}" /usr/local/bin/itemized "$@"` (or executes directly when already non-root); verify script syntax with `sh -n docker-entrypoint.sh` and executable bit (`chmod +x`).
- [x] 1.2 Update `Dockerfile` Stage 3 to install `su-exec`, copy `docker-entrypoint.sh` to `/usr/local/bin/docker-entrypoint.sh`, set `ENV PUID=1000 PGID=1000`, and use `ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]`; verify `Dockerfile` structure.

## 2. Unraid Template & Documentation

- [x] 2.1 Add `PUID` (default `99`) and `PGID` (default `100`) variables to `unraid/itemized.xml` and update `README.md` to document `PUID`/`PGID` and automatic `/data` ownership handling; verify XML well-formedness with `xmllint --noout unraid/itemized.xml`.

## 3. Final Verification

- [x] 3.1 Run `go test ./...`, `go vet ./...`, and `gopls check` on Go files, plus `sh -n docker-entrypoint.sh` and `xmllint --noout unraid/itemized.xml`, confirming zero failures or diagnostics.

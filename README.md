# Itemized

Self-hosted household inventory management built as a single Go binary with an embedded React SPA, SQLite (`WAL` + FTS5 trigram search), and built-in direct LAN Zebra ZPL label printing.

## Quick Start (Docker)

```bash
docker build -t itemized:local .
docker run -d \
  --name itemized \
  -p 8080:8080 \
  -v /path/to/appdata/itemized:/data \
  -e BASE_URL=https://itemized.example.com \
  -e TZ=America/New_York \
  itemized:local
```

Open `http://localhost:8080` to complete first-run administrator setup.

## HTTPS & Reverse Proxy (Required for Mobile Barcode Scanning)

Modern mobile browsers (including iOS Safari and Chrome/Firefox on iOS) disable the camera API (`navigator.mediaDevices`) on plain `http://` LAN URLs such as `http://192.168.1.x:8080`. To use live camera barcode scanning on phones and tablets, serve Itemized over **HTTPS** by placing it behind a reverse proxy (such as Nginx Proxy Manager, Caddy, Traefik, SWAG, or Tailscale Serve).

When running behind a reverse proxy, set:

- `TRUST_PROXY=true` so login rate limiting reads client IPs from `X-Forwarded-For` / `X-Real-IP`.
- `BASE_URL=https://itemized.example.com` so printed QR labels encode your HTTPS URL.

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `8080` | HTTP listen port |
| `DB_PATH` | `/data/itemized.db` | SQLite database path |
| `PUID` | `1000` | User ID for running Itemized and owning `/data` (`99` in Unraid template) |
| `PGID` | `1000` | Group ID for running Itemized and owning `/data` (`100` in Unraid template) |
| `BASE_URL` | *(request host)* | Base URL encoded into printed QR labels |
| `TRUST_PROXY` | `false` | Set to `true` behind a reverse proxy so login rate limiting uses `X-Forwarded-For` / `X-Real-IP` |
| `OIDC_ISSUER` | *(disabled)* | Optional OIDC issuer URL (Auth Code + PKCE) |
| `OIDC_CLIENT_ID` | | Optional OIDC client ID |
| `OIDC_CLIENT_SECRET` | | Optional OIDC client secret |
| `OIDC_AUTO_PROVISION` | `false` | Auto-create `member` accounts on first OIDC login |
| `LLM_PROVIDER` | *(disabled)* | `anthropic`, `openai`, `gemini`, or `openai-compatible` |
| `LLM_MODEL` | | LLM model name for optional UPC normalization |
| `LLM_BASE_URL` | | Custom endpoint (e.g. `http://ollama:11434/v1`) |
| `LLM_API_KEY` | | API key for the configured LLM provider |

All instance settings can also be edited in **Settings** after first-run setup.

## Migrating Legacy PostgreSQL Data

The companion `itemized-migrate` CLI reads a legacy Itemized PostgreSQL database directly, remaps foreign keys to compact integer IDs, preserves original UUIDs in `legacy_uuid` (so existing printed `/go/{i,p,l}/<uuid>` labels keep working), preserves bcrypt password hashes, rebuilds FTS5 indexes, and runs `PRAGMA foreign_key_check`:

```bash
itemized-migrate \
  --pg-url "postgres://user:pass@host:5432/itemized" \
  --sqlite "/data/itemized.db" \
  [--collection-id "<legacy-collection-uuid>"]
```

## Unraid Community Apps

An Unraid template is provided at `unraid/itemized.xml`. Bridge networking reaches LAN printers directly on outbound connections (e.g. `http://192.168.1.50:631/ipp/print` for Zebra ZSB or `192.168.1.50:9100` for Raw TCP ZPL printers).

The container entrypoint automatically ensures `/data` ownership matches `PUID:PGID` (`99:100` / `nobody:users` in the Unraid template, or `1000:1000` by default) before dropping privileges to run `/usr/local/bin/itemized` as a non-root user. If launched with an explicit non-root `--user` flag, privilege dropping is skipped automatically.

## Development

```bash
# Backend tests
go test ./...

# Frontend tests & build
cd web && npm test && npm run build

# Build full single binary (embeds web/dist)
go build ./cmd/itemized
```

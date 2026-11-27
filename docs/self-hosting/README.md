---
title: Self-hosting handbook
summary: Deploy itemized on your own host with TLS, tested SQLite backups, monitoring, and hardening.
audience: admin
entry_point: self-host
order: 1
capabilities:
  - self-hosted-deployment
screens: []
---

Follow these eight sections in order to go from an empty host to a production itemized instance with HTTPS, tested backups, and health monitoring.

## 1. Install

Itemized ships as a single Go binary with an embedded React SPA and a single SQLite database file (`WAL` mode). Choose your deployment method:

| Platform | Guide | Best for |
| --- | --- | --- |
| Docker Compose | [Docker Compose](docker-compose.md) | Recommended for Linux servers and homelabs |
| Docker Run | [Docker Run](docker-run.md) | Quick single-container deployments |
| Unraid | [Unraid Community Apps](unraid.md) | Unraid NAS appliances using the Community Apps template in [itemizedapp/itemized-unraid](https://github.com/itemizedapp/itemized-unraid) |
| Single Binary | [Single Binary](binary.md) | Bare-metal Linux/macOS or systemd without containers |

## 2. First run

1. Open your itemized URL (`http://localhost:8080` or your reverse-proxy HTTPS URL).
2. Complete the **Create Admin Account** screen with an email address and a strong password (at least 8 characters).
3. Open **Settings → Instance Configuration** and confirm **Base URL** matches your public HTTPS URL so printed QR labels resolve cleanly.

## 3. Reverse proxy and TLS

> **Important**: Modern mobile browsers (including iOS Safari and Chrome/Firefox on iOS) disable camera access (`navigator.mediaDevices`) on plain `http://` LAN URLs. Serve itemized over **HTTPS** to use live camera barcode scanning on phones.

Set `TRUST_PROXY=true` and `BASE_URL=https://itemized.example.com` whenever running behind a reverse proxy.

### Caddy

```caddyfile
itemized.example.com {
    reverse_proxy 127.0.0.1:8080
}
```

### nginx

```nginx
server {
    listen 443 ssl http2;
    server_name itemized.example.com;

    ssl_certificate     /etc/letsencrypt/live/itemized.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/itemized.example.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### Traefik

```yaml
labels:
  - "traefik.enable=true"
  - "traefik.http.routers.itemized.rule=Host(`itemized.example.com`)"
  - "traefik.http.routers.itemized.entrypoints=websecure"
  - "traefik.http.routers.itemized.tls.certresolver=letsencrypt"
  - "traefik.http.services.itemized.loadbalancer.server.port=8080"
```

## 4. Backups and restore drill

Itemized stores all state in a single SQLite database (`WAL` mode) at `/data/itemized.db`.

### Create a consistent backup

Use SQLite's online `.backup` command (or stop the container briefly) rather than copying raw files while writes are in flight:

```bash
sqlite3 ./data/itemized.db ".backup '/backups/itemized-$(date +%F).db'"
```

### Run a restore drill

Verify your backup periodically by restoring it into a scratch container and checking both `/up` and your product/item counts:

```bash
mkdir -p /tmp/itemized-restore
cp /backups/itemized-latest.db /tmp/itemized-restore/itemized.db

docker run -d --rm \
  --name itemized-restore-drill \
  -p 18080:8080 \
  -v /tmp/itemized-restore:/data \
  ghcr.io/itemizedapp/itemized:latest

curl -fsS http://127.0.0.1:18080/up
sqlite3 /tmp/itemized-restore/itemized.db "SELECT (SELECT COUNT(*) FROM products) AS products, (SELECT COUNT(*) FROM items) AS items;"

docker stop itemized-restore-drill
rm -rf /tmp/itemized-restore
```

## 5. Upgrading

Database migrations run automatically on startup. Before upgrading:

1. Take a fresh SQLite backup (see [Backups and restore drill](#4-backups-and-restore-drill)).
2. Pull the new image or binary (`docker compose pull && docker compose up -d`).
3. Verify `GET /up` returns `{"status":"ok"}` and inspect container logs for migration output.

## 6. Monitoring

- **Health endpoint**: Poll `GET /up`. A healthy server responds with HTTP `200` and `{"status":"ok"}` without requiring authentication.
- **Logs**: Itemized logs HTTP startup, migration, and error events to `stderr`/`stdout` for collection by Docker, journald, or Loki.

## 7. Hardening

- Serve itemized exclusively over HTTPS behind a reverse proxy.
- Set `TRUST_PROXY=true` only when a trusted reverse proxy sets `X-Forwarded-For` / `X-Real-IP`.
- Run the container as a non-root `PUID`/`PGID` (default `1000:1000`; `99:100` on Unraid).
- Restrict LAN/firewall access if itemized does not need to be exposed to the public internet (e.g., use Tailscale or VPN).
- Consider enabling [OIDC SSO](../configure/accounts-and-sso.md) with `OIDC_FORCE=true` if you already run an identity provider.
- Schedule automated SQLite `.backup` runs and test a restore drill at least quarterly.

## 8. Sizing

Itemized has a minimal footprint suitable for a Raspberry Pi, mini-PC, or NAS:

- **Memory**: ~25–50 MiB RAM at idle; plan for 128 MiB limit with comfortable headroom for FTS5 search and image/barcode assets.
- **CPU**: Minimal; 1 vCPU is more than sufficient for a household.
- **Disk**: The single binary/image is under 40 MB. A household catalog of 1,000 products and 5,000 item records typically uses under 5 MB in SQLite (including WAL and FTS5 indexes).

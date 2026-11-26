---
title: Docker Compose
summary: Deploy itemized using Docker Compose with persistent SQLite storage.
audience: admin
entry_point: self-host
order: 2
capabilities:
  - self-hosted-deployment
screens: []
---

Pre-built multi-architecture images (`linux/amd64` and `linux/arm64`) are published to GitHub Container Registry at `ghcr.io/itemizedapp/itemized:latest`.

## Compose file

Create `compose.yaml`:

```yaml
services:
  itemized:
    image: ghcr.io/itemizedapp/itemized:latest
    container_name: itemized
    restart: unless-stopped
    ports:
      - "8080:8080"
    volumes:
      - ./data:/data
    environment:
      BASE_URL: https://itemized.example.com
      TRUST_PROXY: "true"
      TZ: America/New_York
```

## Start and verify

```bash
docker compose up -d
curl -fsS http://127.0.0.1:8080/up
```

Continue with [First run](README.md#2-first-run) and [Reverse proxy and TLS](README.md#3-reverse-proxy-and-tls) in the self-hosting handbook. See [Configuration reference](configuration.md) for all optional environment variables.

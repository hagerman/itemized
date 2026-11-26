---
title: Docker Run
summary: Launch itemized with a single docker run command.
audience: admin
entry_point: self-host
order: 3
capabilities:
  - self-hosted-deployment
screens: []
---

Run itemized directly with `docker run` using a host directory mounted to `/data` for the SQLite database:

```bash
docker run -d \
  --name itemized \
  --restart unless-stopped \
  -p 8080:8080 \
  -v /path/to/appdata/itemized:/data \
  -e BASE_URL=https://itemized.example.com \
  -e TRUST_PROXY=true \
  -e TZ=America/New_York \
  ghcr.io/itemizedapp/itemized:latest
```

## Verify

```bash
curl -fsS http://127.0.0.1:8080/up
```

Return to the [Self-hosting handbook](README.md#2-first-run) to complete first-run setup and HTTPS configuration.

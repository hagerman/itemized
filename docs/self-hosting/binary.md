---
title: Single binary
summary: Build and run itemized as a standalone Go binary without Docker.
audience: admin
entry_point: self-host
order: 5
capabilities:
  - self-hosted-deployment
screens: []
---

Itemized compiles to a single self-contained Go binary with the React web interface embedded.

## Build from source

Requires Go 1.26+ and Node.js 22+:

```bash
cd web && npm ci && npm run build && cd ..
go build -o itemized ./cmd/itemized
```

## Run

```bash
DB_PATH=/var/lib/itemized/itemized.db \
PORT=8080 \
BASE_URL=https://itemized.example.com \
TRUST_PROXY=true \
./itemized
```

## Systemd service example

```ini
[Unit]
Description=Itemized household inventory
After=network.target

[Service]
Type=simple
User=itemized
Environment=PORT=8080
Environment=DB_PATH=/var/lib/itemized/itemized.db
Environment=BASE_URL=https://itemized.example.com
Environment=TRUST_PROXY=true
ExecStart=/usr/local/bin/itemized
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

Continue with [First run](README.md#2-first-run) and [Reverse proxy and TLS](README.md#3-reverse-proxy-and-tls).

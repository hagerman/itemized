---
title: Unraid Community Apps
summary: Install itemized on Unraid using the included Community Apps XML template.
audience: admin
entry_point: self-host
order: 4
capabilities:
  - self-hosted-deployment
screens: []
---

Itemized includes an Unraid Community Apps template at `unraid/itemized.xml` in the repository.

## Storage and permissions

The container entrypoint automatically ensures `/data` ownership matches `PUID:PGID` (`99:100` / `nobody:users` in the Unraid template) before dropping privileges to run `/usr/local/bin/itemized` as a non-root user. If you launch with an explicit non-root `--user` flag, privilege dropping is skipped automatically.

## Networking and LAN printers

Use standard **Bridge** networking on Unraid. Outbound connections from the container reach LAN label printers directly—for example:

- Zebra ZSB (IPP): `http://192.168.1.50:631/ipp/print`
- Raw TCP ZPL: `192.168.1.50:9100`

## Next steps

Place itemized behind your Unraid reverse proxy (such as Nginx Proxy Manager or SWAG) over HTTPS so mobile camera scanning works, then follow [First run](README.md#2-first-run).

---
title: Configuration reference
summary: Complete list of every environment variable read by itemized, with defaults, examples, and UI editability.
audience: admin
entry_point: reference
order: 2
capabilities:
  - self-hosted-deployment
screens: []
---

**No environment variable is mandatory.** Itemized starts out of the box with sensible defaults (`PORT=8080`, `DB_PATH=/data/itemized.db`).

Settings marked **Editable in UI** can be changed anytime under the **Admin** panels in **Settings** (**General**, **Users & SSO**, and **AI & Classification**); values saved in the database take precedence over environment variable defaults.

## Environment variables

| Variable | Default | Example | Editable in UI | Explained in |
| --- | --- | --- | --- | --- |
| `PORT` | `8080` | `8080` | No | [Self-hosting handbook](README.md) |
| `DB_PATH` | `/data/itemized.db` | `/data/itemized.db` | No | [Backups and restore drill](README.md#4-backups-and-restore-drill) |
| `PUID` | `1000` | `99` | No | [Unraid Community Apps](unraid.md) |
| `PGID` | `1000` | `100` | No | [Unraid Community Apps](unraid.md) |
| `BASE_URL` | *(request host)* | `https://itemized.example.com` | Yes | [Reverse proxy and TLS](README.md#3-reverse-proxy-and-tls) |
| `TRUST_PROXY` | `false` | `true` | No | [Reverse proxy and TLS](README.md#3-reverse-proxy-and-tls) |
| `OIDC_ISSUER` | *(disabled)* | `https://auth.example.com/application/o/itemized/` | Yes | [Household accounts and OIDC SSO](../configure/accounts-and-sso.md) |
| `OIDC_CLIENT_ID` | *(empty)* | `itemized-client` | Yes | [Household accounts and OIDC SSO](../configure/accounts-and-sso.md) |
| `OIDC_CLIENT_SECRET` | *(empty)* | `secret-value` | Yes | [Household accounts and OIDC SSO](../configure/accounts-and-sso.md) |
| `OIDC_AUTO_PROVISION` | `false` | `true` | Yes | [Household accounts and OIDC SSO](../configure/accounts-and-sso.md) |
| `OIDC_FORCE` | `false` | `true` | Yes | [Household accounts and OIDC SSO](../configure/accounts-and-sso.md) |
| `LLM_PROVIDER` | *(disabled)* | `openai-compatible` | Yes | [UPC lookup and AI classification](../configure/upc-and-ai.md) |
| `LLM_MODEL` | *(empty)* | `llama3.2` | Yes | [UPC lookup and AI classification](../configure/upc-and-ai.md) |
| `LLM_BASE_URL` | *(provider default)* | `http://ollama:11434/v1` | Yes | [UPC lookup and AI classification](../configure/upc-and-ai.md) |
| `LLM_API_KEY` | *(empty)* | `sk-...` | Yes | [UPC lookup and AI classification](../configure/upc-and-ai.md) |
| `DEMO_MODE` | `false` | `true` | No | [Demo mode](../get-started/demo-mode.md) |
| `DEMO_RESET_INTERVAL` | `1h` | `30m` | No | [Demo mode](../get-started/demo-mode.md) |

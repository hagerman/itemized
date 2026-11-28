---
title: Architecture overview
summary: High-level architecture of itemized's single-binary Go server, embedded React SPA, and SQLite database.
audience: developer
entry_point: under-the-hood
order: 1
capabilities:
  - self-hosted-deployment
screens: []
---

Itemized compiles into a single Go binary (`cmd/itemized`) that embeds the built React 19 + TypeScript + Vite SPA (`web/dist`) and persists all household data in a single SQLite database (`WAL` mode with FTS5 trigram search).

## Top-level Go packages under `internal/`

| Package | Responsibility | Sub-packages |
| --- | --- | --- |
| `internal/api` | HTTP router, JSON API handlers, rate limiting, and embedded SPA static file server | None |
| `internal/auth` | Password hashing, session cookies, admin middleware, and OIDC (Auth Code + PKCE) client | None |
| `internal/db` | SQLite connection setup (`WAL`, foreign keys) and embedded SQL schema migrations | `internal/db/migrations` |
| `internal/demo` | Public demo mode seed data and hourly wall-clock database reset manager | None |
| `internal/docsverify` | Automated Go drift tests verifying environment variables, API docs, and package maps | None |
| `internal/domain` | Core inventory business logic, due-date calculation rules, and FTS5 trigram search | None |
| `internal/llm` | Optional AI product normalization and reclassification clients (Anthropic, OpenAI, Gemini, Ollama) | None |
| `internal/notify` | Channel-agnostic notification dispatcher, VAPID Web Push delivery, per-user preferences/targets, and daily digest scheduler | None |
| `internal/printer` | Direct LAN Zebra label printing (IPP ZPL and Raw TCP `:9100`) and Go `text/template` ZPL layouts | `internal/printer/templates` |
| `internal/upc` | OpenFoodFacts retail barcode (UPC/EAN) lookup client | None |

For read/write boundaries of every package, see the [Package map](contributing/packages.md). For an end-to-end request walkthrough, see the [Architecture tour](contributing/architecture-tour.md).

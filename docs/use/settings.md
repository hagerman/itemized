---
title: Settings overview
summary: Navigate Account, Instance Configuration, OIDC, AI classification, Household Users, Printers, and ZPL Templates.
audience: user
entry_point: use
order: 10
capabilities:
  - web-ui
screens:
  - settings
---

![Itemized Settings screen displaying Account and Instance Configuration cards](../assets/settings.png)

Open **Settings** by clicking your email address in the bottom-left sidebar footer (or visiting `/settings`). Every card on the Settings page includes a **Learn more** link that opens its matching guide right beside the page without discarding unsaved edits.

## Available sections

- **Account** (all users): Update your email address and password. See [Household accounts and OIDC SSO](accounts-and-sso.md).
- **Instance Configuration** (Admin): Set the **Base URL** encoded in printed QR labels and the **Due Date Rolling Average Count**. See [Inventory and expiration tracking](inventory-and-expiration.md).
- **OIDC** (Admin): Configure optional OpenID Connect single sign-on, auto-provisioning, and forced OIDC login. See [Household accounts and OIDC SSO](accounts-and-sso.md).
- **LLM Product Classification** (Admin): Connect Anthropic, OpenAI, Gemini, or local Ollama for automatic UPC normalization and bulk reclassification. See [UPC lookup and AI classification](upc-and-ai.md).
- **Household Users** (Admin): Create, update roles for, or remove household accounts. See [Household accounts and OIDC SSO](accounts-and-sso.md).
- **Label Printers** and **ZPL Label Templates** (Admin): Configure Zebra ZSB (IPP) or Raw TCP (`:9100`) printers and edit Go-template ZPL layouts. See [Label printing and ZPL templates](label-printing.md).

Settings saved in the UI override environment variable defaults; see the [Configuration reference](../self-hosting/configuration.md) for container-only variables.

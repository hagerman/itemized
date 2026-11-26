# Security Policy

## Supported Versions

Security fixes are applied to the `main` branch and published in the latest release and container image (`ghcr.io/itemizedapp/itemized:latest`).

| Version | Supported |
| --- | --- |
| Latest release / `main` | :white_check_mark: |
| Older releases | :x: |

If you self-host itemized, please keep your deployment updated to the latest release.

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues, discussions, or pull requests.**

Instead, please report them privately using GitHub's built-in private vulnerability reporting:

- **GitHub Security Advisories:** <https://github.com/itemizedapp/itemized/security/advisories/new>

### What to Include

To help us investigate and resolve the issue quickly, please include as much of the following as possible:

- A clear description of the vulnerability and its potential impact.
- Step-by-step instructions or a proof of concept (PoC) to reproduce the issue.
- The version, Docker image digest, or commit SHA you tested against.
- Relevant configuration details (for example, whether OIDC, `TRUST_PROXY`, LLM integration, or LAN printing is enabled).
- Any suggested mitigation or patch, if you have one.

### What to Expect

- **Acknowledgment:** We will acknowledge receipt of your report within **3 business days**.
- **Triage & Updates:** We will investigate the report, determine its severity and scope, and keep you updated as we work on a fix.
- **Resolution & Disclosure:** Once a fix is ready, we will coordinate a release and public advisory with you. If you would like credit in the release notes or advisory, please let us know.

## Scope & Deployment Notes

Areas of particular interest include:

- Authentication, session management, OIDC integration, and role-based access control (`admin` vs. `member`).
- API input validation, SQL injection, XSS, and CSRF protections.
- Outbound network requests (OpenFoodFacts lookups, LLM provider calls, OIDC discovery, and LAN IPP/ZPL printing) and SSRF risks.
- Container privilege dropping (`PUID`/`PGID`) and file handling.

Please note:

- **Demo Mode (`DEMO_MODE=true`)** intentionally bypasses authentication as a demo admin and resets sample data periodically; unauthenticated access in demo mode is expected behavior.
- **Reverse Proxy Configuration:** Only enable `TRUST_PROXY=true` when itemized is deployed behind a trusted reverse proxy that strips or overwrites `X-Forwarded-For` and `X-Real-IP` headers.

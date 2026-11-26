# Proposal

## Why

The Unraid Community Apps XML template is now maintained and published in its own dedicated repository (`https://github.com/itemizedapp/itemized-unraid`). Keeping a duplicate `unraid/itemized.xml` in this repository risks template drift and unnecessary maintenance overhead.

## What Changes

- Remove `unraid/itemized.xml` and the `unraid/` directory from this repository.
- Update `docs/self-hosting/unraid.md` to reference `https://github.com/itemizedapp/itemized-unraid` (and Unraid Community Apps) instead of an in-repo `unraid/itemized.xml`.
- Update the Unraid row in `docs/self-hosting/README.md` to describe the external `itemizedapp/itemized-unraid` template rather than a built-in XML template, and regenerate `README.md` and in-app Help via `make docs-build`.
- Update the `self-hosted-deployment` spec so it no longer requires an in-repo Unraid Community Apps XML template, while preserving multi-arch Docker image and `PUID`/`PGID` privilege-drop support (including Unraid's `99:100`).

## Capabilities

### New Capabilities
<!-- No new capabilities. -->

### Modified Capabilities
- `self-hosted-deployment`: Remove the requirement for an in-repo Unraid Community Apps XML template while keeping the multi-architecture `Dockerfile` and `PUID`/`PGID` non-root entrypoint requirements.

## Impact

- `unraid/itemized.xml` (removed).
- `docs/self-hosting/unraid.md` and `docs/self-hosting/README.md` (updated to link to `https://github.com/itemizedapp/itemized-unraid`).
- `README.md` and `web/src/generated/help/` (regenerated via `make docs-build`).
- `openspec/specs/self-hosted-deployment/spec.md` (updated when archived).
- No Go, React, or Docker runtime behavior changes; `PUID`/`PGID` privilege dropping remains intact for Unraid and other homelab hosts.

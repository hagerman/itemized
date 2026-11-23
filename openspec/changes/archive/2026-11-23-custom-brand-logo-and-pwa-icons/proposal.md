# Proposal

## Why

Itemized currently uses a generic Lucide `Box` icon for its brand mark in the sidebar and login/setup screens, and lacks a favicon, Apple Touch Icon, and PWA manifest icons. Adding a minimal, custom box-inspired brand logo across the UI, browser tab favicon, and installable PWA manifest gives the application a cohesive, recognizable identity.

## What Changes

- Design a minimal, geometric box-inspired custom SVG logo (`BrandLogo`) matching Itemized's dark slate + indigo visual language.
- Replace the generic Lucide `Box` brand icon in the application sidebar (`Layout.tsx`) and authentication/setup screens (`AuthPage.tsx`) with the custom `BrandLogo` component.
- Export the same logo as:
  - Vector favicon (`web/public/favicon.svg`) and raster fallback (`web/public/favicon-32x32.png`) linked in `web/index.html`.
  - Apple Touch Icon (`web/public/apple-touch-icon.png`, 180×180) linked in `web/index.html`.
  - PWA icons (`web/public/icon-192.png`, `web/public/icon-512.png`, plus maskable `web/public/icon-maskable-512.png`) registered in `web/public/manifest.json`.

## Capabilities

### New Capabilities
<!-- None — this extends the existing web-ui capability. -->

### Modified Capabilities
- `web-ui`: Serve the custom minimal box brand logo in the application shell and auth screens, and configure matching favicon, Apple Touch Icon, and PWA manifest icons.

## Impact

- Frontend assets & config: `web/public/favicon.svg`, `web/public/favicon-32x32.png`, `web/public/apple-touch-icon.png`, `web/public/icon-192.png`, `web/public/icon-512.png`, `web/public/icon-maskable-512.png`, `web/public/manifest.json`, `web/index.html`.
- Frontend components: new `web/src/components/BrandLogo.tsx`, updated `web/src/components/Layout.tsx`, `web/src/pages/AuthPage.tsx`, and test coverage in `web/src/components/Layout.test.tsx`.
- No backend or database changes required (Go's `embed` serves everything built into `web/dist/`).

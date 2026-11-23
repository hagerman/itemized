# Tasks

## 1. Custom Brand Logo Component & In-App Integration

- [x] 1.1 Create `web/src/components/BrandLogo.tsx` implementing the minimal geometric box SVG logo, and replace the generic Lucide `Box` brand icon in `web/src/components/Layout.tsx` (sidebar header) and `web/src/pages/AuthPage.tsx` (login/setup header); update `web/src/components/Layout.test.tsx` to assert the custom brand logo renders, and verify with `cd web && ./node_modules/.bin/vitest run --pool=forks src/components/Layout.test.tsx`.

## 2. Favicon, Apple Touch Icon & PWA Manifest Icons

- [x] 2.1 Create `web/public/favicon.svg` matching `BrandLogo` and generate raster PNG icons (`web/public/favicon-32x32.png`, `web/public/apple-touch-icon.png`, `web/public/icon-192.png`, `web/public/icon-512.png`, `web/public/icon-maskable-512.png`); verify all asset files exist with expected PNG dimensions.
- [x] 2.2 Link the SVG favicon, PNG favicon, and `apple-touch-icon` in `web/index.html` and declare the `192x192`, `512x512`, and maskable `512x512` icons in `web/public/manifest.json`; verify with `cd web && ./node_modules/.bin/vitest run --pool=forks && ./node_modules/.bin/tsc --noEmit && ./node_modules/.bin/vite build` and `go build ./...`, confirming all icon assets are copied into `web/dist/`.

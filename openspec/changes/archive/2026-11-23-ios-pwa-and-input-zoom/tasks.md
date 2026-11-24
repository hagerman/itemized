# Tasks

## 1. iOS Full-Screen Home Screen Meta Tags & Icon Verification

- [x] 1.1 Update `web/index.html` to include `<meta name="mobile-web-app-capable" content="yes" />`, `<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />`, and `<meta name="apple-mobile-web-app-title" content="Itemized" />` alongside the existing `viewport-fit=cover`, `apple-mobile-web-app-capable="yes"`, `manifest.json`, and `180x180` `/apple-touch-icon.png` link; verify all required meta tags and icon links are present in `web/index.html` and that `web/public/apple-touch-icon.png` exists as a `180x180` PNG.
- [x] 1.2 Add a Vitest test (e.g., in `web/src/components/Layout.test.tsx` or `web/src/pwa.test.ts`) asserting that `web/index.html` declares `apple-mobile-web-app-capable`, `mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style`, `apple-mobile-web-app-title`, `viewport-fit=cover`, `manifest.json`, and `apple-touch-icon` pointing to `/apple-touch-icon.png`, and verify `npm test` in `web/` passes.

## 2. Prevent iOS Input Auto-Zoom

- [x] 2.1 Add an unlayered CSS rule in `web/src/index.css` scoped to iOS WebKit (`@supports (-webkit-touch-callout: none)`) and coarse touch devices (`@media (pointer: coarse)`) setting `font-size: 16px` on `input:not([type="checkbox"]):not([type="radio"]):not([type="range"]), textarea, select` so Tailwind `text-sm`/`text-xs` utility classes do not trigger iOS auto-zoom while preserving manual pinch-to-zoom; verify the rule is present in `web/src/index.css` and overrides layered utility font sizes.
- [x] 2.2 Extend the Vitest suite to verify `web/src/index.css` defines the iOS/coarse-pointer `16px` font-size rule for `input`, `textarea`, and `select` outside `@layer base`, and verify `npm test` in `web/` passes.

## 3. Standalone iOS Safe-Area Top Inset & Dynamic Viewport Height

- [x] 3.1 Update `web/src/components/Layout.tsx` to use `h-dvh` on the root shell and apply `env(safe-area-inset-top)` padding to the top `<header>` and sidebar/mobile drawer header (and `min-h-dvh` in `web/src/pages/AuthPage.tsx`) so the translucent iOS status bar never overlaps navigation controls in standalone mode; verify via unit tests in `web/src/components/Layout.test.tsx` and `npm test` in `web/`.

## 4. Build & End-to-End Verification

- [x] 4.1 Rebuild the frontend bundle with `cd web && npm test && npm run build` so `web/dist` (embedded via `web/embed.go`) contains the updated `index.html`, CSS, and JS assets, and verify the build succeeds with zero TypeScript or Vite errors.
- [x] 4.2 Run `go test ./...`, `go vet ./...`, and `gopls check` on Go files (resolving `gopls` from `PATH` or `$(go env GOPATH)/bin/gopls`) and verify all checks pass cleanly.

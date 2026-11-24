# Proposal

## Why

On iOS Safari and standalone home-screen web apps, focusing text inputs with a font size smaller than `16px` triggers automatic page zoom, which pushes navigation chrome off-screen and disrupts mobile workflows. In addition, while `web/index.html` already includes `apple-mobile-web-app-capable`, `viewport-fit=cover`, and the `180x180` `apple-touch-icon.png` link, it is missing companion iOS full-screen PWA meta tags (`mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style`, `apple-mobile-web-app-title`) and top safe-area inset handling needed for a clean full-screen standalone experience on notched iOS devices.

## What Changes

- Prevent automatic iOS zoom on form control focus by ensuring `<input>`, `<textarea>`, and `<select>` elements render at a minimum `16px` font size on iOS / mobile touch environments without disabling manual pinch-to-zoom accessibility.
- Complete iOS Add-to-Home-Screen full-screen PWA meta tags in `web/index.html`:
  - Retain existing `viewport-fit=cover`, `apple-mobile-web-app-capable="yes"`, `manifest.json`, and `apple-touch-icon` (`/apple-touch-icon.png`, verified `180x180` PNG).
  - Add `mobile-web-app-capable="yes"`, `apple-mobile-web-app-status-bar-style="black-translucent"`, and `apple-mobile-web-app-title="Itemized"`.
- Ensure the mobile application shell (`Layout.tsx`) accounts for dynamic viewport height (`100dvh`) and top safe-area inset (`env(safe-area-inset-top)`) so the translucent iOS status bar does not overlap the top header or slide-out navigation drawer in standalone mode.
- Add automated frontend test coverage verifying the iOS PWA meta tags/icon link in `web/index.html` and the iOS input auto-zoom prevention rule in `web/src/index.css`.

## Capabilities

### New Capabilities
<!-- None; this extends the existing web-ui capability. -->

### Modified Capabilities
- `web-ui`: Extend `Responsive application shell and PWA support` to require preventing automatic iOS zoom on form input focus and declaring full-screen iOS Add-to-Home-Screen meta tags with top safe-area inset handling alongside the verified Apple Touch Icon.

## Impact

- Frontend HTML/CSS/shell: `web/index.html`, `web/src/index.css`, `web/src/components/Layout.tsx`.
- Frontend tests: `web/src/components/Layout.test.tsx` (or a dedicated PWA/head/CSS test in `web/src/`).
- Embedded web bundle: `web/dist` rebuilt via `npm run build` so the Go binary embeds the updated assets (`web/embed.go`).
- No backend API, database schema, or Go code changes required (Go tests/vet/gopls still run as verification).

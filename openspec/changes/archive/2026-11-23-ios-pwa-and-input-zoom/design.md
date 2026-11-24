# Design

## Context

See `proposal.md` for motivation. Key codebase observations:
- `web/index.html` currently declares `viewport-fit=cover`, `theme-color="#0f172a"`, `apple-mobile-web-app-capable="yes"`, `/manifest.json`, `/favicon.svg`, `/favicon-32x32.png`, and `<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />`.
- `web/public/apple-touch-icon.png` already exists as an opaque `180x180` RGB PNG matching the Itemized brand icon, and `internal/api/server.go` (`spaHandler`) serves static files from embedded `web/dist` without authentication middleware, so iOS can fetch `/apple-touch-icon.png` and `/manifest.json` directly.
- `web/src/index.css` uses Tailwind CSS v4 (`@import "tailwindcss";`). Nearly all form inputs across `web/src/` use Tailwind `text-sm` (`14px`) or `text-xs` (`12px`), which causes iOS WebKit to auto-zoom the viewport whenever focus enters a field.
- `web/src/components/Layout.tsx` uses `h-screen` (`100vh`) on the root shell and already handles bottom safe-area inset (`env(safe-area-inset-bottom)`) on `<main>` and the mobile bottom dock, but does not yet pad for `env(safe-area-inset-top)` on the header or mobile slide-out drawer.

## Goals / Non-Goals

**Goals:**
- Eliminate automatic iOS zoom on focus across all current and future `<input>`, `<textarea>`, and `<select>` elements without sacrificing desktop typography density or manual pinch-to-zoom accessibility.
- Complete iOS Add-to-Home-Screen full-screen metadata in `web/index.html` while keeping the verified `180x180` `/apple-touch-icon.png` link intact.
- Keep top navigation and drawer chrome clear of the iOS status bar when launched in `black-translucent` full-screen standalone mode.

**Non-Goals:**
- Changing the visual brand icon artwork (the existing `180x180` `apple-touch-icon.png` and PWA icons are already generated and valid).
- Adding a Service Worker or offline caching strategy.
- Disabling user pinch-to-zoom (`user-scalable=no`).

## Decisions

### 1. Prevent iOS auto-zoom via global unlayered CSS (`font-size: 16px`) targeting iOS WebKit and coarse touch viewports
- **Choice**: Add a global rule in `web/src/index.css` (outside `@layer base` so it is not overridden by Tailwind v4 `@layer utilities` classes like `text-sm` / `text-xs`) scoped to `@supports (-webkit-touch-callout: none)` and `@media (pointer: coarse)` setting `font-size: 16px;` on `input, textarea, select` (excluding non-text types such as `checkbox`, `radio`, `range`, `file`, `button`, `submit`, `reset` if needed, though setting `16px` on `input:not([type="checkbox"]):not([type="radio"]):not([type="range"]), textarea, select` is clean and safe).
- **Rationale**:
  - iOS Safari and standalone WebKit PWAs auto-zoom solely because a focused text/select control has computed `font-size < 16px`.
  - `@supports (-webkit-touch-callout: none)` specifically matches iOS WebKit on both iPhone and iPad (portrait and landscape) without altering desktop Safari/Chrome/Firefox `text-sm` density.
  - Because Tailwind v4 places utility classes (`text-sm`, `text-xs`) inside `@layer utilities`, an unlayered rule wins the CSS cascade automatically without needing `!important` or editing dozens of component JSX files, and it automatically protects future inputs.
- **Alternatives considered**:
  - *Adding `maximum-scale=1` or `user-scalable=no` to `<meta name="viewport">`*: Rejected as primary mechanism because it degrades accessibility on Android/non-iOS browsers and triggers Lighthouse accessibility warnings.
  - *Updating every `<input>`/`<select>`/`<textarea>` component to `text-base lg:text-sm`*: Rejected as primary mechanism because it touches many files, is easy to forget on new inputs, and would still miss landscape iPad viewports (`>= 1024px`).

### 2. Complete iOS Add-to-Home-Screen full-screen meta tags in `web/index.html`
- **Choice**: Keep the existing `viewport` (`width=device-width, initial-scale=1.0, viewport-fit=cover`), `theme-color` (`#0f172a`), `apple-mobile-web-app-capable="yes"`, `apple-touch-icon` (`180x180` -> `/apple-touch-icon.png`), and `manifest.json` link, and add:
  - `<meta name="mobile-web-app-capable" content="yes" />`
  - `<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />`
  - `<meta name="apple-mobile-web-app-title" content="Itemized" />`
- **Rationale**:
  - `apple-mobile-web-app-capable="yes"` + `manifest.json` (`"display": "standalone"`) enables full-screen launch on iOS Home Screen; `mobile-web-app-capable="yes"` satisfies modern standards and avoids deprecation warnings in Chromium DevTools.
  - `black-translucent` lets the dark `#0f172a` / `bg-slate-950` app chrome extend cleanly behind the iOS status bar with light status-bar text, matching the app's dark theme.
  - `apple-mobile-web-app-title="Itemized"` ensures a clean home-screen icon label.

### 3. Safe-area top inset and dynamic viewport height in `Layout.tsx`
- **Choice**:
  - Change root container height in `web/src/components/Layout.tsx` from `h-screen` to `h-dvh` (and `min-h-dvh` in `AuthPage.tsx`) so the layout tracks the visible viewport height on iOS when browser bars or the keyboard appear.
  - Add `pt-[env(safe-area-inset-top)]` to the top `<header>` (adjusting from fixed `h-16` to `min-h-16` or wrapping/padding with `pt-[env(safe-area-inset-top)]` so the 4rem bar content sits below the status bar) and to the sidebar/drawer header so the translucent status bar never overlaps the menu button, page title, or drawer close button.
- **Rationale**: Without top safe-area padding, `black-translucent` + `viewport-fit=cover` places the iOS clock/Dynamic Island directly over the top header buttons.

## Risks / Trade-offs

- **Slightly taller inputs on touch devices** → Setting `16px` instead of `14px`/`12px` increases input text size by 2–4px on iOS/coarse-pointer devices; inputs already have flexible padding (`py-1.5`/`py-2`/`py-2.5`) and `w-full`/`flex-1`, except compact numeric inputs (`w-16`/`w-20`) in `ScannerDrawer` which still comfortably fit 2–3 digits at `16px`.
- **Embedded `web/dist` drift** → Because Go embeds `web/dist` via `web/embed.go`, forgetting to rebuild `web/dist` would leave the Go binary serving stale HTML/CSS. Mitigated by including `npm run build` in the implementation tasks before running `go test ./...`.

# Proposal

## Why

With `apple-mobile-web-app-status-bar-style` set to `"default"`, iOS standalone PWAs sample the document root (`<html>`/`<body>`) background color to paint the status bar / notch area above the viewport. Because `<body>` currently uses `bg-slate-50 dark:bg-slate-950` (`#020617` in dark mode) while the top `<header>` and sidebar use `bg-white dark:bg-slate-900` (`#0f172a` in dark mode), dark mode shows a noticeably darker strip in the notch area above the header. Matching the document root (`<html>` and `<body>`) background color to the header surface (`#ffffff` in light mode, `#0f172a` in dark mode) makes the status bar / notch area blend seamlessly with the header in both light and dark modes while preserving the `slate-50` / `slate-950` page canvas inside the app shell.

## What Changes

- Set `:root` (`html`) background color in `web/src/index.css` to `#ffffff` in light mode and `#0f172a` in `:root.dark` (matching `LIGHT_THEME_COLOR` / `DARK_THEME_COLOR` and `<header>`).
- Update `<body>` background classes in `web/index.html` from `bg-slate-50 dark:bg-slate-950` to `bg-white dark:bg-slate-900` (while keeping `Layout`, `AuthPage`, and loading views on `bg-slate-50 dark:bg-slate-950`).
- Add test coverage in `web/src/pwa.test.ts` verifying that `:root` / `:root.dark` and `<body>` use the header-matching light (`#ffffff` / `bg-white`) and dark (`#0f172a` / `dark:bg-slate-900`) background colors.

## Capabilities

### New Capabilities
<!-- None -->

### Modified Capabilities
- `web-ui`: Specify that the document root (`html`/`body`) background color matches the top header surface (`#ffffff` in light mode, `#0f172a` in dark mode) so the iOS PWA status bar / notch area blends seamlessly with the header in both themes.

## Impact

- `web/src/index.css` (`:root` and `:root.dark` background-color in `@layer base`)
- `web/index.html` (`<body>` background utility classes)
- `web/src/pwa.test.ts` (assertions for root/body light and dark status-bar-matching backgrounds)
- No backend, API, database, or dependency changes.

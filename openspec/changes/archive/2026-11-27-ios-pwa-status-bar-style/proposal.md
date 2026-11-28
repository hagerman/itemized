# Proposal

## Why

When running Itemized as an installed iOS Home Screen PWA, `<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />` instructs iOS to render the web view behind the system status bar and composite a translucent blur overlay across the top of the screen (visibly blurring the top edge of the mobile navigation drawer, backdrop, and header). Switching to the standard `"default"` status bar style removes the translucent status-bar overlay so the top of the app renders cleanly without blur artifacts.

## What Changes

- Update `<meta name="apple-mobile-web-app-status-bar-style">` in `web/index.html` from `"black-translucent"` to `"default"`.
- Preserve `viewport-fit=cover` and existing `env(safe-area-inset-top)` / `env(safe-area-inset-bottom)` layout padding so the bottom navigation dock remains protected from the iOS home indicator and top safe-area padding adapts cleanly (collapsing to `0px` when the status bar is opaque, or still guarding content if iOS extends into the status bar).
- Update `web/src/pwa.test.ts` to assert `apple-mobile-web-app-status-bar-style` is set to `"default"`.

> Note: iOS caches `apple-mobile-web-app-status-bar-style` when a PWA is added to the Home Screen, so existing iOS installs must be removed and re-added to pick up the updated status bar style.

## Capabilities

### New Capabilities
<!-- None -->

### Modified Capabilities
- `web-ui`: Specify that `index.html` declares `apple-mobile-web-app-status-bar-style` with `content="default"` (instead of `black-translucent`) so iOS standalone PWAs do not apply a translucent blur overlay across the top of the screen.

## Impact

- `web/index.html` (`apple-mobile-web-app-status-bar-style` meta tag)
- `web/src/pwa.test.ts` (iOS PWA meta tag test assertion)
- No backend, API, database, or dependency changes.

# Proposal

## Why

When running Itemized as an installed iOS PWA on devices with a home indicator (`viewport-fit=cover`), the mobile bottom navigation dock is severely squished vertically. The dock container sets a fixed `h-16` (`4rem` / `64px`) alongside `pb-[env(safe-area-inset-bottom)]` (`~34px` on iOS) under `box-sizing: border-box`, leaving only `~30px` for the 3 navigation buttons (`Inventory`, `Scan / Action`, `Search`), which compresses and clips their icons and labels.

## What Changes

- Expand the mobile bottom navigation dock's total height from `h-16` to `h-[calc(4rem+env(safe-area-inset-bottom))]` while keeping `pb-[env(safe-area-inset-bottom)]`, matching the top header's `h-[calc(4rem+env(safe-area-inset-top))]` pattern so the interactive button row always maintains a full `4rem` height above the bottom safe-area inset.
- Add semantic navigation landmark markup (`<nav aria-label="Mobile navigation">`) to the mobile bottom dock for accessibility and reliable test targeting.
- Add bottom safe-area inset padding (`pb-[calc(0.75rem+env(safe-area-inset-bottom))] lg:pb-3`) to the sidebar footer so the account/logout row in the mobile slide-out drawer is also clear of the iOS home indicator.
- Add unit tests in `web/src/components/Layout.test.tsx` asserting the mobile bottom dock's height and bottom safe-area padding classes.

## Capabilities

### New Capabilities

### Modified Capabilities
- `web-ui`: Add explicit bottom safe-area inset sizing requirements for the mobile bottom navigation dock and mobile drawer footer in standalone iOS full-screen PWA mode under `Responsive application shell and PWA support`.

## Impact

- Affected frontend code: `web/src/components/Layout.tsx`, `web/src/components/Layout.test.tsx`
- Embedded frontend build: `web/dist` (rebuilt via `npm run build` so the Go binary serves the updated bundle)
- No backend API, database, or dependency changes.

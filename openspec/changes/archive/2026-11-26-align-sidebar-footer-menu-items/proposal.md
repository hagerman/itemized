# Proposal

## Why

In the navigation sidebar footer (both the persistent desktop sidebar and the mobile slide-out drawer), the `Help` link is horizontally inset with `px-2 py-1.5` padding while the account/settings link (`user.email`) directly beneath it has no horizontal or vertical padding. This leaves the `?` and gear icons visibly misaligned on different vertical axes, making the footer look uneven.

## What Changes

- Align the sidebar footer `Help` link and account/settings (`user.email`) link on the same horizontal axis with matching horizontal and vertical padding (`px-2 py-1.5`), icon sizing (`shrink-0`), rounded hover/active surface treatment, and consistent vertical spacing.
- Preserve existing truncation behavior for long user email addresses, the right-aligned Logout button (hidden in demo mode), and bottom safe-area inset padding in the mobile drawer.
- Add unit tests in `web/src/components/Layout.test.tsx` verifying that the `Help` and settings links share consistent alignment classes and behavior.

## Capabilities

### New Capabilities
<!-- None -->

### Modified Capabilities
- `web-ui`: Add sidebar footer alignment requirement so the `Help` and account/settings menu items align vertically on the same leading edge in both desktop sidebar and mobile drawer layouts.

## Impact

- Affected code: `web/src/components/Layout.tsx` (sidebar footer markup/classes) and `web/src/components/Layout.test.tsx` (unit test coverage).
- No backend, API, database, or dependency changes.

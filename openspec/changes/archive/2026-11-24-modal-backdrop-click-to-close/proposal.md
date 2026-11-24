# Proposal

## Why

Modal dialogs in the web UI (`ScannerDrawer`, `BarcodeScanModal`, Quick Search, and Keyboard Shortcuts) currently only close via their header `X` button or the `Escape` key (where wired), which feels inconsistent with the mobile navigation drawer and standard web modal expectations. Allowing users to click or tap the darkened backdrop outside any modal dialog makes dismissal faster and more ergonomic on both desktop and mobile devices.

## What Changes

- Add click-outside (backdrop) dismissal to all modal dialogs in the web UI:
  - `ScannerDrawer` (`web/src/components/ScannerDrawer.tsx`)
  - `BarcodeScanModal` (`web/src/components/BarcodeScanModal.tsx`)
  - Quick Search modal (`web/src/components/Layout.tsx`)
  - Keyboard Shortcuts help modal (`web/src/components/Layout.tsx`)
- Ensure interactions inside a modal panel—including clicking buttons/inputs or dragging a pointer selection from inside the modal out onto the backdrop—do not dismiss the dialog.
- Add frontend unit tests verifying backdrop dismissal and inside-click preservation across the modal dialogs.

## Capabilities

### New Capabilities
<!-- None; this extends existing web UI dialog behavior. -->

### Modified Capabilities
- `web-ui`: Add modal dialog backdrop click-to-close requirement covering all modal dialogs while preserving inside interactions and pointer drags starting inside the dialog.

## Impact

- Affected frontend components: `web/src/components/Layout.tsx`, `web/src/components/ScannerDrawer.tsx`, `web/src/components/BarcodeScanModal.tsx` (plus a small shared modal backdrop helper/component if extracted).
- Affected frontend tests: `web/src/components/Layout.test.tsx`, `web/src/components/Scanner.test.tsx`, and `web/src/pages/ProductDetailPage.test.tsx` (or a dedicated modal test).
- No backend API, database, or dependency changes.

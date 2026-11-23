# Proposal

## Why

When opening `Scan / Action` on a mobile device, users currently have to tap the Camera button every time before scanning a barcode, adding unnecessary friction to the primary mobile workflow. In addition, opening dropdown selectors (such as `Location to Audit` in Inventory or destination pickers in Transfer/Purchase) inside the compact `Scan & Action` modal clips the dropdown and triggers internal scrolling even when plenty of vertical viewport space is available.

## What Changes

- **Mobile-first default camera activation**: Automatically enable the live barcode/QR camera when opening `Scan / Action` on mobile devices (keeping the camera hidden by default on desktop), and suppress text-input `autoFocus` when the camera starts automatically on mobile so the virtual keyboard does not cover the viewfinder.
- **Dynamic modal height expansion & unclipped dropdowns**:
  - Keep the `Scan & Action` modal compact when collapsed, bottom-aligned on mobile (`items-end`) and middle-aligned on desktop (`sm:items-center`), expanding vertically as needed when vertical viewport space is available (up to `92dvh`) before falling back to scrolling.
  - Eliminate internal dropdown clipping/scrolling inside `Scan & Action`: allow single-column hierarchy pickers (`Transfer` destination and `Inventory` location) to expand the modal height cleanly in normal flow when open, and render floating `HierarchySelect` menus (such as in `Purchase` multi-column grids) via a viewport-anchored portal so they are never clipped by `overflow-y-auto`.

## Capabilities

### New Capabilities
<!-- None — this refines the existing barcode-scanning capability. -->

### Modified Capabilities
- `barcode-scanning`: Automatically start the camera by default on mobile devices (while keeping it hidden on desktop) and dynamically expand the Scan & Action modal height within available vertical space without clipping dropdown selectors.

## Impact

- Frontend: `web/src/components/BarcodeScanner.tsx`, `web/src/components/ScannerDrawer.tsx`, `web/src/components/HierarchySelect.tsx`, and unit tests in `web/src/components/Scanner.test.tsx` and `web/src/components/HierarchySelect.test.tsx`.
- No backend or database changes required.

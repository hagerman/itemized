# Proposal

## Why

Currently, closing and reopening the `Scan / Action` modal preserves partially entered forms, selected items, search hits, banners, and audit/transfer selections because `ScannerDrawer` remains mounted while closed. This stale state is confusing when starting a new scan session, while the user's chosen scan mode (e.g., `Consume`) is not persisted across browser reloads or modal opens—instead `Layout` resets it to `Purchase` whenever `Scan / Action` is clicked.

## What Changes

- Reset all transient workflow, form, search, lookup, selection, destination/audit, and banner/toast state whenever the `Scan / Action` modal is closed and reopened, and discard any in-flight UPC/classification lookup results from a closed session.
- Persist the user's selected scan mode (`purchase`, `consume`, `open`, `transfer`, or `inventory`) in browser `localStorage` so reopening `Scan / Action` (including after page reloads on the same browser) always opens in the last chosen mode, defaulting to `purchase` when no valid mode is stored.
- Remove the hardcoded `setScannerMode("purchase")` reset from the desktop sidebar and mobile dock `Scan / Action` buttons in `Layout`.

## Capabilities

### New Capabilities
<!-- None -->

### Modified Capabilities
- `barcode-scanning`: Update the `Shared live scanner with mode switching` requirement so that closing and reopening the `Scan / Action` modal resets all transient workflow and form state while retaining only the user's last selected scan mode persisted per browser.

## Impact

- Frontend components: `web/src/components/ScannerDrawer.tsx`, `web/src/components/Layout.tsx`.
- Frontend tests: `web/src/components/Scanner.test.tsx`, `web/src/components/Layout.test.tsx`.
- No backend, database, or API changes.

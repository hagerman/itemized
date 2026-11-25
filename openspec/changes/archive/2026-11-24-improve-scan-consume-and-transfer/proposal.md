# Proposal

## Why

During rapid barcode scanning on mobile and handheld scanners, users lack visual confirmation alongside the audio beep in Consume mode, receive misleading "Consumed" confirmations when rescanning an item that was already marked as consumed, and find the location-first Transfer flow awkward when gathering multiple items before moving them to a destination. Updating these scanning behaviors makes Consume feedback unmistakable, prevents confusing duplicate consumptions, and aligns Transfer with the natural physical workflow of picking items first and then scanning or selecting where they are going.

## What Changes

- **Consume scan visual flash**: Trigger a brief visual flash accompanying the scan beep whenever a scan is registered in `Consume` mode, visible both on the live camera viewfinder and on the scanner bar so users get immediate visual confirmation with or without audio.
- **Already-consumed item notice**: When an item barcode (`/go/i/:id` or item UUID) is scanned after that item already has `consumed_on_date` set, do not re-consume or overwrite its consumption date; instead display a clear notice containing the item's product name stating that it was already consumed (and keep `POST /api/items/:id/consume` idempotent without overwriting an existing `consumed_on_date`).
- **Items-first Transfer workflow**: **BREAKING** (UX workflow change) — Replace the location-first Transfer flow with an items-first staged Transfer flow:
  - Users scan one or more item QRs, product QRs, or retail UPCs to add items to a visible staged transfer list (with ability to remove staged items before completing).
  - Scanning a product QR displays all in-stock items of that product so the user can select one or more existing items to add to the staged transfer list.
  - Scanning a retail UPC displays all in-stock items matching that barcode's specific variant so the user can select one or more existing items to add to the staged transfer list.
  - Completing the transfer happens by scanning a destination location QR (`/go/l/:id`) or keying in/selecting the destination location and confirming, which moves all staged items to that location (applying freeze/thaw due-date rules and label reprints as before).

## Capabilities

### New Capabilities

<!-- None -->

### Modified Capabilities

- `barcode-scanning`: Update `Shared live scanner with mode switching`, `Consume and Open workflows with continuous scan and undo`, and `Transfer workflow` requirements to add visual flash feedback on Consume scans, explicit already-consumed item notices with product name, and the items-first staged Transfer workflow with product-level and variant-level item selection.

## Impact

- **Frontend**: `web/src/components/BarcodeScanner.tsx` (visual flash feedback synced with scan beep), `web/src/components/ScannerDrawer.tsx` (Consume already-consumed handling, flash prop, and redesigned items-first Transfer state and UI), and `web/src/components/Scanner.test.tsx`.
- **Backend**: `internal/api/items.go` (preserve existing `consumed_on_date` and report `already_consumed` in `POST /api/items/:id/consume`), plus unit/API tests in `internal/api/api_test.go`. Existing `POST /api/scan/resolve` and `POST /api/items/bulk` endpoints already return item `consumed_on_date` and `variant_id` and support bulk transfers.

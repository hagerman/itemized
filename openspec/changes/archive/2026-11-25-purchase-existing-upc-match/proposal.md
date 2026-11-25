# Proposal

## Why

In the Purchase workflow, scanning a retail UPC that is already mapped to an existing product variant can still fall through to OpenFoodFacts lookup, LLM product classification, and the "Create Product & Add Items" flow. This happens because `POST /api/scan/resolve` only matches exact barcode strings (missing equivalent UPC-A / EAN-13 / GTIN-14 leading-zero representations emitted by camera or HID scanners), `BarcodeScanner` debounces duplicates only by exact string (allowing a dual-engine or repeat scan in an equivalent format to fire immediately after a match), and `ScannerDrawer` does not cancel/clear stale or in-flight unknown-barcode lookup/classification state when a known barcode resolves.

## What Changes

- Normalize and match equivalent retail numeric barcode representations (exact match first, then UPC-A / EAN-13 / GTIN-14 leading-zero equivalents) in `POST /api/scan/resolve` so existing variant barcodes always resolve to `kind: "barcode"` with their mapped product and variant.
- Cancel in-flight unknown-barcode lookups/classifications and clear stale lookup/classification UI state in `ScannerDrawer` whenever a known barcode, product, or item is resolved in Purchase mode, ensuring existing mapped UPCs proceed directly to Confirm & Add without invoking OpenFoodFacts or LLM classification.
- Deduplicate equivalent numeric retail barcode forms within `BarcodeScanner`'s duplicate-scan debounce window so scanning the same physical barcode as both 12-digit UPC-A and 13-digit EAN-13 does not emit a second scan.

## Capabilities

### New Capabilities

_(None)_

### Modified Capabilities

- `barcode-scanning`: Update `Unified scan resolution endpoint`, `Streamlined Purchase workflow`, and `Shared live scanner with mode switching` requirements so existing retail barcodes match across equivalent UPC/EAN/GTIN leading-zero forms, Purchase mode never runs lookup/classification for matched barcodes and cancels any in-flight lookup state on match, and scanner duplicate-debounce treats equivalent retail barcode forms as the same scan.

## Impact

- Backend: `internal/api/workflows.go` (`handleScanResolve` and retail barcode equivalence helper), `internal/api/api_test.go`.
- Frontend: `web/src/components/ScannerDrawer.tsx` (`handlePurchaseScan`), `web/src/components/BarcodeScanner.tsx` (`emitScan` debounce key), `web/src/components/Scanner.test.tsx`.
- No database schema migrations or breaking API changes.

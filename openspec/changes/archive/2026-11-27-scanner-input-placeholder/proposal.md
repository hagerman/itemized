# Proposal

## Why

The default placeholder text in the Scan & Action input (`"Scan barcode, QR URL, or type to search..."`) mentions QR URLs, which is technical jargon that is unnecessary for everyday scanning and searching. Simplifying the placeholder to `"Scan barcode or type to search..."` makes the input clearer and cleaner while preserving all existing barcode, QR URL, and search functionality.

## What Changes

- Update the default `placeholder` prop of `BarcodeScanner` (`web/src/components/BarcodeScanner.tsx`) from `"Scan barcode, QR URL, or type to search..."` to `"Scan barcode or type to search..."`, which is used by the shared Scan & Action modal (`ScannerDrawer`).
- Keep custom `placeholder` overrides (such as `BarcodeScanModal`'s `"Scan or enter barcode..."`) and all QR URL resolution/scanning behavior unchanged.
- Add unit test coverage in `web/src/components/Scanner.test.tsx` asserting the updated default placeholder text.

## Capabilities

### New Capabilities
<!-- None -->

### Modified Capabilities
- `barcode-scanning`: Specify that the shared live scanner input displays `"Scan barcode or type to search..."` as its default placeholder text without mentioning QR URLs.

## Impact

- `web/src/components/BarcodeScanner.tsx` (default `placeholder` prop value)
- `web/src/components/Scanner.test.tsx` (default placeholder unit test)
- No backend, API, database, or dependency changes.

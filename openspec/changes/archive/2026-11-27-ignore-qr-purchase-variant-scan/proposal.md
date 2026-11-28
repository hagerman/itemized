# Proposal

## Why

Many retail products now print a marketing or informational QR code directly beside their UPC/EAN barcode. When scanning in the Purchase workflow or capturing a variant barcode on the product detail page, the live camera scanner frequently picks up the adjacent QR code instead of the retail UPC, triggering bogus product-name searches or filling the variant barcode field with a URL. QR codes are only needed for Itemized's `Consume`, `Open`, `Transfer`, and `Inventory` workflows (where printed item, product, and location QR labels are scanned).

## What Changes

- Configure the shared live camera scanner (`BarcodeScanner`) with an option to enable or ignore QR code decoding across both decoding engines (native `BarcodeDetector` and self-hosted `zxing-wasm`) without restarting the active camera stream or losing torch state when the option toggles.
- Disable QR code camera decoding when `ScannerDrawer` is in `Purchase` mode (including when scanning into primary or second barcode fields in Purchase), while keeping QR code decoding enabled in `Consume`, `Open`, `Transfer`, and `Inventory` modes.
- Disable QR code camera decoding in `BarcodeScanModal` when scanning into a variant's barcode input on `/products/:id` (`ProductDetailPage`).

## Capabilities

### New Capabilities
<!-- None -->

### Modified Capabilities
- `barcode-scanning`: Require the live camera scanner to ignore QR codes (decoding 1D retail barcode formats only) while in `Purchase` mode, while continuing to decode QR codes in `Consume`, `Open`, `Transfer`, and `Inventory` modes without restarting the camera stream on mode switch.
- `variant-and-barcode-management`: Require the variant barcode scan modal on `/products/:id` to ignore QR codes during live camera scanning and decode only 1D retail barcode formats.

## Impact

- Frontend components: `web/src/components/BarcodeScanner.tsx`, `web/src/components/ScannerDrawer.tsx`, `web/src/components/BarcodeScanModal.tsx`, `web/src/pages/ProductDetailPage.tsx`.
- Frontend tests: `web/src/components/Scanner.test.tsx`, `web/src/pages/ProductDetailPage.test.tsx`.
- No backend API, database schema, or dependency changes.

# Design

## Context

See [proposal.md](./proposal.md) for motivation and scope.

Currently, `BarcodeScanner` (`web/src/components/BarcodeScanner.tsx`) decodes a fixed list of formats that always includes QR codes (`"qr_code"` for native `BarcodeDetector` and `"QRCode"` for `zxing-wasm`) alongside 1D retail barcode formats (`UPCA`, `UPCE`, `EAN13`, `EAN8`, `Code128`, `Code39`, `ITF`). Both `ScannerDrawer` (shared across `Purchase`, `Consume`, `Open`, `Transfer`, and `Inventory` modes) and `BarcodeScanModal` (used for variant barcode capture in `ProductDetailPage`) render `BarcodeScanner`.

A key constraint from the existing `barcode-scanning` spec is that switching scan modes in `ScannerDrawer` MUST preserve the active camera `MediaStream` and torch preference without restarting the camera.

## Goals / Non-Goals

**Goals:**
- Allow callers of `BarcodeScanner` (and `BarcodeScanModal`) to disable live camera QR code decoding via a clean boolean prop (`allowQrCodes`, defaulting to `true` for backward compatibility).
- Exclude QR code formats at the decoder level in both native `BarcodeDetector` and `zxing-wasm` so an adjacent QR code next to a retail UPC does not preempt 1D barcode detection (especially important because `zxing-wasm` uses `maxNumberOfSymbols: 1`).
- Toggle QR decoding dynamically when `ScannerDrawer` switches between `Purchase` (`allowQrCodes={false}`) and `Consume`/`Open`/`Transfer`/`Inventory` (`allowQrCodes={true}`) without restarting `getUserMedia` or resetting torch state.
- Pass `allowQrCodes={false}` for variant barcode scanning on `/products/:id` (`ProductDetailPage` → `BarcodeScanModal` → `BarcodeScanner`).

**Non-Goals:**
- Filtering or rejecting manual text / keyboard / HID input in the scanner bar (users still type product names, paste barcodes, or use HID scanners in Purchase mode).
- Changing `POST /api/scan/resolve` or any backend API behavior.
- Changing QR scanning behavior on the standalone `/go/...` QR Quick Action routes.

## Decisions

### 1. Prop API: `allowQrCodes?: boolean` (default `true`) on `BarcodeScanner` and `BarcodeScanModal`
- `BarcodeScanner` adds `allowQrCodes = true` (defaulting to `true` preserves existing standalone behavior and tests).
- `ScannerDrawer` passes `allowQrCodes={mode !== "purchase"}`. Because primary and second barcode scan targets (`scanTarget`) live inside Purchase mode, they automatically inherit `allowQrCodes={false}`.
- `BarcodeScanModal` accepts `allowQrCodes = true` and forwards it to `BarcodeScanner`; `ProductDetailPage` passes `allowQrCodes={false}` on its variant `BarcodeScanModal`.
- **Alternative considered:** Passing an explicit `formats` array prop. Rejected as over-engineered—every caller only needs either "1D + QR" or "1D retail only", and a boolean keeps the native and ZXing format lists encapsulated inside `BarcodeScanner`.

### 2. Dynamic format switching via `useRef` without restarting the camera `useEffect`
- Store `allowQrCodesRef.current = allowQrCodes` in `BarcodeScanner` and keep `allowQrCodes` OUT of the `startCamera` `useEffect` dependency array (`[active, cameraEnabled, selectedDeviceId]`).
- **ZXing-WASM engine:** Define two constant `ReaderOptions` objects—`ZXING_READER_OPTIONS_WITH_QR` (includes `"QRCode"`) and `ZXING_READER_OPTIONS_1D_ONLY` (1D formats only). On each frame, `decodeWasmFrame` passes `allowQrCodesRef.current ? ZXING_READER_OPTIONS_WITH_QR : ZXING_READER_OPTIONS_1D_ONLY` to `readBarcodes(...)`. Because `QRCode` is omitted from `formats`, ZXing ignores QR symbols in the frame even with `maxNumberOfSymbols: 1` and decodes the adjacent UPC directly.
- **Native `BarcodeDetector` engine:** Define `NATIVE_1D_FORMATS` and `NATIVE_ALL_FORMATS` (`["qr_code", ...NATIVE_1D_FORMATS]`). Inside `startCamera`, after filtering against `BarcodeDetector.getSupportedFormats()` (when present), construct two lightweight detector instances—`detectorWithQr` and `detector1dOnly` (falling back gracefully if a filtered format set is empty). On each animation frame, select the detector matching `allowQrCodesRef.current`, and additionally skip any hit with `format === "qr_code"` when `!allowQrCodesRef.current` as a defensive guard against browser quirks.
- **Alternative considered:** Adding `allowQrCodes` to the `startCamera` `useEffect` dependencies. Rejected because switching between `Purchase` and `Consume` would tear down and re-acquire `getUserMedia`, causing camera flicker, permission/focus reset, and torch shutoff (violating the `Switching scan modes preserves camera session` requirement).
- **Alternative considered:** Always decoding QR codes and discarding hits whose text looks like a URL or `/go/...` path. Rejected because (a) with `maxNumberOfSymbols: 1` (or a detector returning QR first), a QR code next to a UPC would block the UPC from being decoded, and (b) non-URL QR codes (like GS1/batch/promo codes) would still slip through.

## Risks / Trade-offs

- [Native `BarcodeDetector` browser ignores `formats` or omits `format` on returned hits] → Using a 1D-only `BarcodeDetector` instance prevents QR detection in conformant browsers, and the `hit.format !== "qr_code"` check adds a second layer of protection.
- [User intentionally wants to scan a printed Itemized `/go/p/:id` QR code in Purchase mode] → Per user requirement, Purchase mode is specifically for retail 1D barcodes; users can still type/search the product name in Purchase mode or scan printed QR codes in `Consume`, `Open`, `Transfer`, and `Inventory` modes.

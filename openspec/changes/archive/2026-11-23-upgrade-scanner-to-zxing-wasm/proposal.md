# Proposal

## Why

Live barcode and QR code scanning on iOS Safari still fails to detect clear UPC and printed QR captures when using the unmaintained pure-JS `@zxing/library` port, and unexpected decoder failures are silently swallowed. Replacing `@zxing/library` with self-hosted `zxing-wasm` (modern ZXing-C++ compiled to WebAssembly), driving it with a clean canvas-to-`ImageData` pipeline, making `video.play()` non-fatal when `autoPlay` is active, and surfacing decoder initialization errors will deliver fast, reliable 1D UPC and 2D QR scanning on iOS Safari with zero external CDN dependencies.

## What Changes

- **Replace `@zxing/library` with `zxing-wasm` (`web/package.json`, `web/src/components/BarcodeScanner.tsx`)**:
  - Install `zxing-wasm` and remove `@zxing/library`.
  - Bundle `zxing-wasm/reader/zxing_reader.wasm` locally via Vite `?url` asset import and configure `prepareZXingModule({ overrides: { locateFile: () => zxingReaderWasmUrl } })` so the WASM binary is embedded into the Go binary and served directly from Itemized (no external CDN requests).
- **Canvas-to-`ImageData` WASM decode loop (`web/src/components/BarcodeScanner.tsx`)**:
  - Capture frames from the active `<video>` element onto a reusable offscreen `<canvas>` (scaled down to at most 1024px on the long edge to keep `getImageData` fast and memory-safe on iOS Safari while preserving 1D bar sharpness).
  - Decode `ImageData` using `readBarcodes` from `zxing-wasm/reader` with `formats: ["QRCode", "UPCA", "UPCE", "EAN13", "EAN8", "Code128", "Code39", "ITF"]`, `tryHarder: true`, `tryRotate: true`, `tryInvert: true`, `tryDownscale: true`, and `maxNumberOfSymbols: 1`.
  - Schedule subsequent frames sequentially after each decode completes (~120 ms delay) so frames never pile up on mobile devices.
- **Harden iOS startup and error visibility (`web/src/components/BarcodeScanner.tsx`)**:
  - Make `video.play()` non-fatal (catching `AbortError` when `autoPlay` is already starting playback) so the decode loop always starts.
  - Check `BarcodeDetector.getSupportedFormats()` before instantiating native `window.BarcodeDetector` so unsupported formats cannot abort startup.
  - Surface decoder initialization or repeated WASM runtime failures in `cameraError` instead of silently swallowing them.
- **Verify `.wasm` static asset MIME type (`internal/api/api_test.go`)**:
  - Ensure embedded `.wasm` assets are served with `Content-Type: application/wasm` so `WebAssembly.instantiateStreaming` works cleanly on iOS Safari.
- **Update frontend unit tests (`web/src/components/Scanner.test.tsx`)**:
  - Update scanner tests to mock `zxing-wasm/reader` (`prepareZXingModule`, `readBarcodes`), verify canvas frame extraction and UPC/QR emission without native `BarcodeDetector`, verify recovery from transient frame errors, and verify surfacing of WASM initialization failures.

## Capabilities

### New Capabilities

### Modified Capabilities
- `barcode-scanning`: Require self-hosted WebAssembly barcode/QR decoding (with no external CDN dependency), non-fatal `autoPlay` startup, and visible error reporting if the decoder fails to initialize.

## Impact

- `web/package.json` and `web/package-lock.json`: Replace `@zxing/library` with `zxing-wasm`.
- `web/src/components/BarcodeScanner.tsx`: Switch to `zxing-wasm/reader` with local `.wasm` bundling, bounded-size canvas capture, non-fatal `video.play()`, safe `BarcodeDetector` format filtering, and decoder error surfacing.
- `web/src/components/Scanner.test.tsx`: Update tests for `zxing-wasm/reader` pipeline and decoder error surfacing.
- `internal/api/api_test.go`: Add test asserting `.wasm` static assets are served with `Content-Type: application/wasm`.

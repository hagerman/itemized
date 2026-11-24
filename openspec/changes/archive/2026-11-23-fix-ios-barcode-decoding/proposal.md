# Proposal

## Why

On iOS Safari (and any browser without the native `BarcodeDetector` API), the live camera viewfinder displays video over HTTPS but never decodes UPC barcodes or printed QR labels. `BarcodeScanner.tsx` calls `await video.play()` before invoking ZXing's `decodeFromVideoElementContinuously(video, ...)`, which internally waits for a future `'playing'` event that has already fired—leaving the ZXing decoding loop permanently stalled.

## What Changes

- **Fix ZXing live decoding loop (`web/src/components/BarcodeScanner.tsx`)**: Replace `zxingReader.decodeFromVideoElementContinuously(video, ...)` with an explicit throttled frame-decoding loop that runs directly against the active playing `<video>` element (only once `video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0`) and recovers from transient frame errors instead of terminating.
- **Configure ZXing decode hints for retail barcodes and QR codes (`web/src/components/BarcodeScanner.tsx`)**: Pass `DecodeHintType.TRY_HARDER = true` and `DecodeHintType.POSSIBLE_FORMATS` covering `QR_CODE`, `UPC_A`, `UPC_E`, `EAN_13`, `EAN_8`, `CODE_128`, `CODE_39`, and `ITF` to `BrowserMultiFormatReader`.
- **Improve iOS camera stream quality (`web/src/components/BarcodeScanner.tsx`)**: Request ideal HD resolution (`width: { ideal: 1280 }`, `height: { ideal: 720 }`) in `getUserMedia` video constraints and add `autoPlay` on the `<video>` element so 1D UPC barcodes and compact QR labels are sharp enough to decode reliably on iOS Safari.
- **Add unit test coverage (`web/src/components/Scanner.test.tsx`)**: Verify that decoding runs on an already-playing video element when `window.BarcodeDetector` is unavailable (the iOS Safari path), configures ZXing format/try-harder hints, and emits scanned UPC/QR codes without waiting for a post-play `'playing'` event.

## Capabilities

### New Capabilities

### Modified Capabilities
- `barcode-scanning`: Require continuous live decoding of retail barcodes and QR codes on browsers without native `BarcodeDetector` (such as iOS Safari), including active already-playing video streams and transient frame error resilience.

## Impact

- `web/src/components/BarcodeScanner.tsx`: Replace `decodeFromVideoElementContinuously` with direct frame-decoding loop, add ZXing `DecodeHintType` hints, request ideal 1280×720 video constraints, add `autoPlay` attribute.
- `web/src/components/Scanner.test.tsx`: Add unit tests verifying iOS/fallback decoding without `window.BarcodeDetector` and HD video constraints.
- No backend API, database, or dependency changes.

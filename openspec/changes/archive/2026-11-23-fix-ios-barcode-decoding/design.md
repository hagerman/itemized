# Design

## Context

See `proposal.md` for root cause. Inside `@zxing/library`'s `BrowserCodeReader`:
- `decodeFromVideoElementContinuously(video, cb)` calls `await this.playVideoOnLoadAsync(video)` before starting `decodeContinuously`.
- `playVideoOnLoadAsync` registers `video.addEventListener('playing', resolve)` and calls `tryPlayVideo(video)`.
- Because `BarcodeScanner.tsx` already called `await video.play()`, `isVideoPlaying(video)` is `true`, so `tryPlayVideo` returns early without re-firing `'playing'`, and `playVideoOnLoadAsync` hangs forever.
- Additionally, `decodeContinuously` permanently stops its retry loop if `decode()` throws any exception other than `NotFoundException`, `ChecksumException`, or `FormatException` (for example, a canvas error if called before `videoWidth > 0`), and caches the capture canvas size on the first frame.

Because iOS Safari does not implement `window.BarcodeDetector`, this completely disables live scanning on iOS for both UPC barcodes and QR codes.

## Goals / Non-Goals

**Goals:**
- Guarantee that ZXing frame decoding runs reliably on already-playing `<video>` elements on iOS Safari and all other browsers without native `BarcodeDetector`.
- Improve 1D retail UPC and 2D QR recognition accuracy using ZXing `TRY_HARDER` + explicit `POSSIBLE_FORMATS` hints and ideal 1280×720 camera stream constraints.
- Keep the existing `window.BarcodeDetector` fast path working on browsers that support it (Chrome/Edge/Android).

**Non-Goals:**
- Adding a new third-party WASM/JS barcode scanning library (such as `zxing-wasm` or `html5-qrcode`) unless needed later; fixing the stalled `@zxing/library` loop resolves the immediate failure with zero new dependencies.
- Changing backend `/api/scan/resolve` or workflow handling.

## Decisions

1. **Replace `decodeFromVideoElementContinuously` with a controlled throttled decode loop**
   - **Decision**: Instantiate `BrowserMultiFormatReader` with `DecodeHintType.TRY_HARDER = true` and `DecodeHintType.POSSIBLE_FORMATS` (`QR_CODE`, `UPC_A`, `UPC_E`, `EAN_13`, `EAN_8`, `CODE_128`, `CODE_39`, `ITF`). After `await video.play()`, schedule a `setTimeout` loop (~150 ms interval) that checks `!cancelled`, `video.readyState >= 2`, `video.videoWidth > 0`, and `video.videoHeight > 0`, then calls `zxingReader.decode(video)` inside a `try/catch` that always reschedules the next tick unless cancelled.
   - **Rationale**: Eliminates the `'playing'` event deadlock, avoids 0×0 canvas creation before metadata/frames arrive, survives transient errors (e.g., iOS orientation/focus changes), and cleans up deterministically via `clearTimeout` on unmount.
   - **Alternatives considered**: Calling `decodeFromVideoElementContinuously` *before* `video.play()` (still brittle if `autoPlay` fires `'playing'` first, and still permanently dies on non-NotFound errors); switching to `decodeFromStream` (takes ownership of the `MediaStream` and complicates our torch/lens lifecycle).

2. **Request ideal HD resolution (`1280x720`) in `getUserMedia` constraints**
   - **Decision**: Include `width: { ideal: 1280 }, height: { ideal: 720 }` in the `video` MediaTrackConstraints alongside `facingMode: "environment"` or `deviceId: { exact: selectedDeviceId }`.
   - **Rationale**: Uses `ideal` (never `exact`), so browsers gracefully fall back to the closest supported resolution without throwing `OverconstrainedError`, while preventing iOS Safari from defaulting to blurry 640×480 streams where thin UPC bars bleed together.

3. **Keep `autoPlay` alongside `playsInline` and `muted` on `<video>`**
   - **Decision**: Add `autoPlay` to `<video ref={videoRef} autoPlay playsInline muted ... />`.
   - **Rationale**: Matches iOS WebKit recommendations for inline camera streams.

## Risks / Trade-offs

- **CPU/battery usage on mobile** → Throttling the ZXing decode loop to ~150 ms (~6–7 fps) keeps scanning responsive without pegging the main thread on iOS.
- **Canvas size mismatch on device rotation** → If `video.videoWidth` / `video.videoHeight` changes after the first frame (e.g., rotating between portrait and landscape on iOS), `BrowserCodeReader`'s cached `captureCanvas` would keep old dimensions unless reset. Tracking last seen dimensions and calling `zxingReader.reset()` (or creating a fresh reader / updating canvas dimensions) when `videoWidth`/`videoHeight` changes avoids distorted frames after rotation.

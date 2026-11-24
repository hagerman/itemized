# Design

## Context

See `proposal.md` for motivation. Even with a direct `setTimeout` loop around `@zxing/library`'s `BrowserMultiFormatReader.decode(video)`, real-device testing on iOS Safari over HTTPS showed live camera frames (including crisp, centered QR labels and retail UPC barcodes) failing to produce any scan callback. `@zxing/library` is an archived 2020 pure-JavaScript port with fragile canvas/luminance handling and poor 1D/2D tolerance on mobile camera streams, and our bare `catch {}` hid any unexpected decode exceptions.

## Goals / Non-Goals

**Goals:**
- Replace `@zxing/library` with `zxing-wasm` (`zxing-wasm/reader`), which compiles modern ZXing-C++ to WebAssembly and provides markedly faster, more accurate 1D UPC and 2D QR decoding on iOS Safari.
- Bundle `zxing_reader.wasm` locally inside `web/dist/assets/` (embedded into the Go binary via `web/embed.go`) so Itemized works fully offline on LANs with zero external CDN requests.
- Keep `video.play()` non-fatal (when `autoPlay` is active) and guard native `window.BarcodeDetector` against unsupported formats.
- Surface decoder initialization failures in `cameraError` so failures are never silent.

**Non-Goals:**
- Adding a photo-upload fallback or changing the Scanner modal UI layout.
- Changing backend scan resolution (`/api/scan/resolve`) or workflows.

## Decisions

1. **Use `zxing-wasm/reader` with Vite `?url` local WASM bundling**
   - **Decision**: Import `prepareZXingModule` and `readBarcodes` from `zxing-wasm/reader`, and import the WASM binary URL via `import zxingReaderWasmUrl from "zxing-wasm/reader/zxing_reader.wasm?url"`. Call `prepareZXingModule({ overrides: { locateFile: () => zxingReaderWasmUrl } })` once at startup (before entering the decode loop).
   - **Rationale**: By default `zxing-wasm` fetches `.wasm` from jsDelivr CDN, which breaks air-gapped/LAN homelab deployments and violates self-hosted expectations. Vite's `?url` emits the `.wasm` into `web/dist/assets/` with a content hash, which Go embeds and serves with `Content-Type: application/wasm`.
   - **Alternatives considered**: Keeping `@zxing/library` and debugging further (still weak on 1D UPC on iOS); `barcode-detector/ponyfill` (wraps `zxing-wasm` anyway, adding an extra package layer without direct access to `tryRotate`/`tryDownscale`/`tryInvert` tuning).

2. **Explicit reusable `<canvas>` with max 1024px bounding box → `ImageData` → `readBarcodes`**
   - **Decision**: Maintain a reusable offscreen `<canvas>` inside the camera effect. On each tick, compute target dimensions scaled down proportionally so `Math.max(w, h) <= 1024`, draw the `<video>` frame onto the canvas, read `ctx.getImageData(0, 0, w, h)`, and `await readBarcodes(imageData, { formats: ["QRCode", "UPCA", "UPCE", "EAN13", "EAN8", "Code128", "Code39", "ITF"], tryHarder: true, tryRotate: true, tryInvert: true, tryDownscale: true, maxNumberOfSymbols: 1 })`. Schedule the next tick with `setTimeout(..., 120)` only *after* `await readBarcodes` settles.
   - **Rationale**: Capping the long edge at 1024px keeps `getImageData` memory and copy latency low on iOS WebKit while keeping 1D UPC bars sharp. Sequential scheduling prevents overlapping WASM calls.

3. **Non-fatal `video.play()` and safe `BarcodeDetector` format check**
   - **Decision**: Wrap `await video.play()` in `try { await video.play(); } catch { /* autoPlay handles playback */ }`. Before instantiating `window.BarcodeDetector`, check `BarcodeDetector.getSupportedFormats?.()` (if present) and filter our requested formats to only those supported, catching constructor errors so native detector issues never block the WASM loop.
   - **Rationale**: Prevents iOS Safari `AbortError` on concurrent `autoPlay` + `play()`, and prevents experimental Safari `BarcodeDetector` flags from aborting camera startup.

4. **Surface WASM initialization errors**
   - **Decision**: If `await prepareZXingModule(...)` fails, set `cameraError` (e.g., `"Barcode decoder failed to initialize: ..."`) instead of swallowing it silently. Inside the per-frame loop, transient frame errors keep retrying.
   - **Rationale**: Gives immediate diagnostic feedback if `.wasm` loading ever fails (e.g., reverse proxy stripping MIME types or blocking `.wasm`).

## Risks / Trade-offs

- **Bundle / binary size** → `zxing_reader.wasm` adds ~800 KB to `web/dist/assets/` (embedded in the Go binary), while removing `@zxing/library` removes ~450 KB of JS from the main bundle. Net impact is small and well worth reliable iOS scanning.
- **Reverse proxy `.wasm` MIME type** → Go's `http.FileServer` serves `.wasm` as `application/wasm` (verified by unit test in `internal/api/api_test.go`).

# Tasks

## 1. Dependencies & Local WASM Bundling

- [x] 1.1 Replace `@zxing/library` with `zxing-wasm` in `web/package.json` and `web/package-lock.json` (`cd web && npm uninstall @zxing/library && npm install zxing-wasm`) and verify `zxing-wasm/reader` and `zxing-wasm/reader/zxing_reader.wasm` resolve cleanly

## 2. Scanner WASM Decoding Pipeline & Startup Hardening

- [x] 2.1 Update `web/src/components/BarcodeScanner.tsx` to configure `prepareZXingModule` with the local Vite `?url` import of `zxing-wasm/reader/zxing_reader.wasm`, capture bounded-size (`<= 1024px` long edge) canvas frames into `ImageData`, run a sequential `setTimeout` (~120 ms) loop calling `readBarcodes` with `QRCode`, `UPCA`, `UPCE`, `EAN13`, `EAN8`, `Code128`, `Code39`, `ITF` and `tryHarder`/`tryRotate`/`tryInvert`/`tryDownscale`, make `video.play()` non-fatal, guard native `window.BarcodeDetector` with supported-format filtering, and surface WASM initialization errors in `cameraError`; verify with unit tests in `web/src/components/Scanner.test.tsx` covering UPC/QR decoding without `BarcodeDetector`, transient frame error recovery, and WASM initialization error display

## 3. Backend WASM Asset Verification

- [x] 3.1 Add a test in `internal/api/api_test.go` verifying that `.wasm` files served by the embedded SPA handler return `200 OK` with `Content-Type: application/wasm`, and verify `go test ./internal/api/...` passes

## 4. Verification

- [x] 4.1 Run frontend tests and production build (`cd web && npm test && npm run build`) and verify all tests pass, TypeScript/Vite build succeeds, and a local `zxing_reader-*.wasm` file is emitted in `web/dist/assets/`
- [x] 4.2 Run `go test ./...`, `go vet ./...`, and `gopls check` on Go files (resolving `gopls` from `PATH` or `$(go env GOPATH)/bin/gopls`) and verify all checks pass with zero diagnostics

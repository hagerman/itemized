# Tasks

## 1. Live Scanner QR Filtering

- [x] 1.1 Add `allowQrCodes?: boolean` (default `true`) prop and `allowQrCodesRef` to `web/src/components/BarcodeScanner.tsx`, split format definitions into 1D-only vs 1D+QR for both `zxing-wasm` (`readBarcodes`) and native `BarcodeDetector` (constructing 1D-only and 1D+QR detector instances and guarding against `format === "qr_code"` hits when disabled), without adding `allowQrCodes` to the camera `useEffect` dependency array; verify with unit tests in `web/src/components/Scanner.test.tsx` covering `zxing-wasm` format options, native `BarcodeDetector` format selection/filtering, and toggling `allowQrCodes` without calling `getUserMedia` again.

## 2. Purchase Mode & Variant Barcode Scan Wiring

- [x] 2.1 Pass `allowQrCodes={mode !== "purchase"}` from `web/src/components/ScannerDrawer.tsx` to `BarcodeScanner`; verify with tests in `web/src/components/Scanner.test.tsx` that `Purchase` mode excludes QR codes while `Consume`, `Open`, `Transfer`, and `Inventory` modes include QR codes and switching modes does not restart the camera stream.
- [x] 2.2 Add `allowQrCodes?: boolean` (default `true`) prop to `web/src/components/BarcodeScanModal.tsx` forwarding to `BarcodeScanner`, and pass `allowQrCodes={false}` in `web/src/pages/ProductDetailPage.tsx` for the variant `BarcodeScanModal`; verify with a test in `web/src/pages/ProductDetailPage.test.tsx` that opening the variant barcode scan modal excludes QR code formats during live camera decoding.

## 3. Verification

- [x] 3.1 Run the frontend test suite and production build (`cd web && npm test -- --run && npm run build`) and verify all tests and TypeScript/Vite build checks pass cleanly.
- [x] 3.2 Run `go test ./...`, `go vet ./...`, and `gopls check` on Go files (resolving `gopls` from `PATH` or `$(go env GOPATH)/bin/gopls`) and verify zero errors or diagnostics.

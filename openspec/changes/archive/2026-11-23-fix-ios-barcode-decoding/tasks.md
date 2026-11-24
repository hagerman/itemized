# Tasks

## 1. Fix ZXing Live Decoding Loop & Stream Quality

- [x] 1.1 Update `web/src/components/BarcodeScanner.tsx` to configure `BrowserMultiFormatReader` with `DecodeHintType.TRY_HARDER` (`true`) and `DecodeHintType.POSSIBLE_FORMATS` (`QR_CODE`, `UPC_A`, `UPC_E`, `EAN_13`, `EAN_8`, `CODE_128`, `CODE_39`, `ITF`), replace `decodeFromVideoElementContinuously` with a throttled `setTimeout` frame-decoding loop calling `zxingReader.decode(video)` only when `video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0` (recreating/resetting the reader if video dimensions change and continuing on transient decode errors), request ideal `1280x720` video constraints, and add `autoPlay` to `<video>`; verify with unit tests in `web/src/components/Scanner.test.tsx` that decoding runs on an already-playing video without `window.BarcodeDetector`, recovers after a transient decode error, emits decoded UPC/QR codes, and requests ideal `1280x720` constraints

## 2. Verification

- [x] 2.1 Run frontend tests and production build (`cd web && npm test && npm run build`) and verify all tests pass and TypeScript/Vite build succeeds with no errors
- [x] 2.2 Run `go test ./...`, `go vet ./...`, and `gopls check` on Go files (resolving `gopls` from `PATH` or `$(go env GOPATH)/bin/gopls`) and verify all checks pass with zero diagnostics

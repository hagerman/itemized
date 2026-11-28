# Tasks

## 1. Scanner Input Placeholder

- [x] 1.1 Update the default `placeholder` prop in `web/src/components/BarcodeScanner.tsx` from `"Scan barcode, QR URL, or type to search..."` to `"Scan barcode or type to search..."`, add a unit test in `web/src/components/Scanner.test.tsx` verifying the updated default placeholder (and that custom `placeholder` overrides still work), and verify with `npm --prefix web test -- --run src/components/Scanner.test.tsx`

## 2. Verification

- [x] 2.1 Run frontend test suite and production build (`npm --prefix web test -- --run && npm --prefix web run build`) and confirm all tests and the build pass
- [x] 2.2 Run Go verification (`go test ./...`, `go vet ./...`, and `gopls check` on Go files) and confirm zero errors or diagnostics

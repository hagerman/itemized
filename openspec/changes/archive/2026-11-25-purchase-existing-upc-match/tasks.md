# Tasks

## 1. Backend Retail Barcode Equivalence Resolution

- [x] 1.1 Add a retail barcode candidate helper in `internal/api/workflows.go` and update `handleScanResolve` to try exact `barcodes.barcode` match first and fall back to leading-zero equivalent GTIN/UPC/EAN forms (11–14 digit UPC-A ↔ EAN-13 ↔ GTIN-14) in deterministic priority order, verified by `go test ./internal/api -run TestScanResolve` passing.
- [x] 1.2 Add unit and API tests in `internal/api/api_test.go` covering exact-match precedence, 13-digit EAN-13 scan matching stored 12-digit UPC-A, 12-digit UPC-A scan matching stored 13-digit leading-zero EAN-13, 14-digit GTIN-14 scan matching stored 12-digit UPC-A, and unrecognized barcodes still returning `kind: "unknown"`, verified by `go test ./internal/api/...` passing.

## 2. Frontend Purchase Flow State Hygiene & Equivalent-Barcode Debounce

- [x] 2.1 Update `handlePurchaseScan` in `web/src/components/ScannerDrawer.tsx` so resolving an existing `barcode`, `product`, or `item` immediately increments `lookupSeqRef.current`, resets `lookupPhase` to `"idle"`, clears `upcHint`, `classifyWarning`, `purchaseSearchHits`, `secondBarcode`, and `secondBarcodeQty`, and sets `purchaseBarcodeQty` from `res.barcode.default_quantity`, verified by `npm test` in `web/` passing.
- [x] 2.2 Update `emitScan` in `web/src/components/BarcodeScanner.tsx` to normalize 11–14 digit numeric retail barcodes (stripping leading zeros) for the 1500ms duplicate-scan debounce key while preserving the raw emitted barcode string, verified by `npm test` in `web/` passing.
- [x] 2.3 Add frontend tests in `web/src/components/Scanner.test.tsx` verifying that (a) scanning a known barcode in Purchase mode proceeds directly to Confirm & Add without calling `/api/upc/lookup` or `/api/upc/classify`, (b) scanning a known barcode while an unknown-barcode lookup/classification is in flight cancels/discards the late response and clears loading/banner/search state, and (c) `BarcodeScanner` debounces equivalent 12-digit UPC-A and 13-digit leading-zero EAN-13 scans within 1500ms, verified by `npm test` in `web/` passing.

## 3. End-to-End Verification

- [x] 3.1 Run Go verification across the workspace: `go test ./...`, `go vet ./...`, and `gopls check` on modified/all Go files (resolving `gopls` from `PATH` or `$(go env GOPATH)/bin/gopls`), ensuring zero failures or diagnostics.
- [x] 3.2 Run frontend verification in `web/` (`npm test` and `npm run build`), ensuring all tests pass and the production bundle builds cleanly.

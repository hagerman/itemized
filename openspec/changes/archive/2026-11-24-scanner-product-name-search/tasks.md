# Tasks

## 1. Product-Name Search in Consume, Open, and Transfer

- [x] 1.1 Add `actionSearchHits` state and shared `loadProductCandidates` / `searchInStockProducts` helpers in `web/src/components/ScannerDrawer.tsx` (clearing `actionSearchHits` in `resetSubState`, before new scans, on product selection, and after applying/transferring), and wire `handleConsumeOpenScan` and `handleTransferScan` to query `GET /api/products?status=in_stock&q=...` for non-barcode unknown inputs (keeping 6–14 digit unknown barcode behavior unchanged). Verify with `cd web && npm test -- src/components/Scanner.test.tsx`.
- [x] 1.2 Render the clickable `Matching Products` list (up to 8 results showing product name and category name, matching `Purchase` mode styling) in `web/src/components/ScannerDrawer.tsx` for `consume`, `open`, and `transfer` modes when `actionSearchHits.length > 0`, ensuring idle `Consume` and `Open` heights are unaffected when empty. Add/update unit tests in `web/src/components/Scanner.test.tsx` covering multi-match product selection, single-match direct load, zero-match messaging, and numeric unknown barcode handling across `Consume`, `Open`, and `Transfer` modes, and verify `cd web && npm test -- src/components/Scanner.test.tsx` passes.

## 2. Verification

- [x] 2.1 Run the frontend test suite and production build (`cd web && npm test && npm run build`) and verify all tests and TypeScript/Vite checks pass cleanly.
- [x] 2.2 Run `go test ./...`, `go vet ./...`, and `gopls check` on Go files (resolving `gopls` from `PATH` or `$(go env GOPATH)/bin/gopls`) and verify all checks pass with zero diagnostics.

# Tasks

## 1. Reset Purchase Quantity and Transient Form State

- [x] 1.1 Update `resetSubState()` in `web/src/components/ScannerDrawer.tsx` to reset `purchaseQty` (`1`), `purchaseBarcodeQty` (`1`), `secondBarcodeQty` (`1`), `variantId` (`null`), `showVariantSection` (`false`), `newProdName` (`""`), and `purchasePrintMode` (`"per_item"`), and verify `npm test -- --run src/components/Scanner.test.tsx` (from `web/`) passes.
- [x] 1.2 Update `handlePurchaseScan` in `web/src/components/ScannerDrawer.tsx` so both the unknown numeric barcode path and the text search path (including unmatched new-product creation) reset `purchaseQty` (`1`), `purchaseBarcodeQty` (`1`), `secondBarcode` (`""`), `secondBarcodeQty` (`1`), `purchasePrintMode` (`"per_item"`), and stale variant/product/due-date/measurement fields before entering the new purchase flow, and verify `npm test -- --run src/components/Scanner.test.tsx` (from `web/`) passes.
- [x] 1.3 Add regression tests in `web/src/components/Scanner.test.tsx` covering: (a) submitting a purchase with quantity `10` (and custom pack quantities) and then starting a new-product purchase via unknown barcode and via unmatched text search verifies `Quantity` and pack quantities default to `1`; and (b) entering quantity `10` and scanning a second unknown barcode or unmatched text search without submitting resets `Quantity` to `1`. Verify `npm test -- --run src/components/Scanner.test.tsx` (from `web/`) passes.

## 2. Verification

- [x] 2.1 Run the frontend test suite and production build (`npm test -- --run && npm run build` in `web/`) and verify all tests and TypeScript/Vite build checks pass cleanly.
- [x] 2.2 Run Go verification (`go test ./...`, `go vet ./...`, and `gopls check` on Go files) and verify all checks pass with zero diagnostics.

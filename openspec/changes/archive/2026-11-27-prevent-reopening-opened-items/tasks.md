# Tasks

## 1. Backend API Guardrails

- [x] 1.1 Update `handleOpenItem` in `internal/api/items.go` to return HTTP 200 with `already_opened: true` (and `already_opened: false` on a fresh open) without modifying `opened_on_date`, `due_on_date`, `updated_at`, or triggering label reprints when `prev.OpenedOnDate != nil`; verify with new/updated tests in `internal/api/api_test.go` covering fresh open, repeat open preserving original dates and zero reprints, and existing `TestDueDateAutoReprint`.
- [x] 1.2 Update `handleBulkItems` (`case "open"`) in `internal/api/items.go` to skip items where `prev.OpenedOnDate != nil || prev.ConsumedOnDate != nil` so only unopened in-stock items are updated and counted in `processed`; verify with a bulk open test in `internal/api/api_test.go` mixing opened and unopened items.

## 2. Product Detail Page UI

- [x] 2.1 Update `web/src/pages/ProductDetailPage.tsx` to omit per-item `Open` buttons on both desktop table rows and mobile stacked cards when `it.opened_on_date` is set (adjusting the mobile action grid columns cleanly for 1, 2, or 3 visible buttons), and omit the bulk `Open` button when all selected items are already opened; verify with unit tests in `web/src/pages/ProductDetailPage.test.tsx` covering desktop/mobile opened vs. unopened items (with and without printers) and bulk selection of all-opened vs. mixed items.

## 3. Scan / Action Screen (`Open` Mode)

- [x] 3.1 Update `web/src/components/ScannerDrawer.tsx` in `Open` mode so scanning an already-opened item QR or UUID does not call `/api/items/:id/open` or show an "Opened" undo toast and instead displays an error naming the item and its opened date (also handling `already_opened: true` in the API response as a fallback), and so product/barcode/location scans, product-name search, and inline barcode association in `Open` mode filter out already-opened items and display an already-opened error when in-stock items exist but all are already opened; verify with tests in `web/src/components/Scanner.test.tsx` (`npm test` in `web/`).

## 4. Verification

- [x] 4.1 Run `go test ./...`, `go vet ./...`, and `gopls check` on Go files, and run `npm test` and `npm run build` in `web/`, confirming all tests, lint/vet checks, diagnostics, and production build pass cleanly.

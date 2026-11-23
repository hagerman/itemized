# Tasks

## 1. Responsive Product Detail Page (`/products/:id`)

- [x] 1.1 Update header actions in `web/src/pages/ProductDetailPage.tsx` so `Add to List`, `Print Label`, `Edit`, and `Delete` collapse to icon-only buttons on narrow viewports (`hidden sm:inline` labels) with `aria-label` and `title` attributes, staying on a single horizontal row without wrapping.
- [x] 1.2 Add a mobile vertical card layout (`md:hidden`) for `Items in Stock` in `web/src/pages/ProductDetailPage.tsx` (checkbox, item ID, location, dates, and full-width single-row `Open` / `Consume` / `Print` buttons plus mobile Select All) while keeping the desktop table (`hidden md:block`) with `whitespace-nowrap` action buttons; verify with unit tests in `web/src/pages/ProductDetailPage.test.tsx` (`npm test`).

## 2. Inline Variant & Barcode Management on `/products/:id`

- [x] 2.1 Add a reusable `<BarcodeScanModal />` in `web/src/components/BarcodeScanModal.tsx` wrapping `<BarcodeScanner />` to capture a single scan into a callback and close automatically.
- [x] 2.2 Implement inline Variant CRUD (`POST /api/products/:id/variants`, `PATCH /api/variants/:id`, `DELETE /api/variants/:id`) and inline Barcode Add/Delete (`POST /api/variants/:id/barcodes`, `DELETE /api/barcodes/:id`) on `web/src/pages/ProductDetailPage.tsx`, pairing each barcode input + scan button + pack quantity on one row and surfacing 409 duplicate errors; verify with tests in `web/src/pages/ProductDetailPage.test.tsx` (`npm test`).

## 3. Purchase Variant & Barcode Row Layout + Scan-to-Field Capture

- [x] 3.1 Redesign the Variant & Barcode Details section in `web/src/components/ScannerDrawer.tsx` so Variant name sits on its own row and each barcode (primary and second) sits on the same row as its pack quantity with a scan-to-fill button that routes the next `<BarcodeScanner />` scan directly into that field without triggering `/api/scan/resolve`; verify tests in `web/src/components/Scanner.test.tsx`, `tsc --noEmit`, `vite build`, and `go build ./...` all pass cleanly.

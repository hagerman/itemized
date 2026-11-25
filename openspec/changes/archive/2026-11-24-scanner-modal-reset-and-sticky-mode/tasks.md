# Tasks

## 1. Scanner Drawer Reset & Sticky Mode Persistence

- [x] 1.1 Split `web/src/components/ScannerDrawer.tsx` into an outer `ScannerDrawer` shell and an unmount-on-close `ScannerDrawerContent` component so all transient workflow state (Purchase form fields/hits/lookups, Consume/Open selections and unknown-barcode association, Transfer destination, Inventory Audit location/counts/summary, status/error banners, and Undo toast) resets automatically whenever `open` becomes `false`, and add unmount cleanup to discard in-flight UPC/classification lookup results; verify with unit tests in `web/src/components/Scanner.test.tsx` covering close-and-reopen reset across modes and late async lookup cancellation.
- [x] 1.2 Add validated `localStorage` persistence (`itemized.scanMode`) for the active `ScanMode` in `web/src/components/ScannerDrawer.tsx` (with `try/catch` fallback to `initialMode ?? "purchase"` when storage is empty, invalid, or unavailable) and keep mode switching inside an open modal from unmounting `BarcodeScanner`; clear `localStorage` in `beforeEach` in `web/src/components/Scanner.test.tsx` and add unit tests verifying mode persistence across close/reopen, remounts (simulating browser reload), invalid stored values, and storage errors.

## 2. Layout Integration

- [x] 2.1 Remove the hardcoded `setScannerMode("purchase")` reset and unused `scannerMode` state from `web/src/components/Layout.tsx` so both the desktop sidebar and mobile bottom dock `Scan / Action` buttons open `ScannerDrawer` in the browser's persisted mode; add a test in `web/src/components/Layout.test.tsx` verifying that switching modes, closing, and reopening via `Scan / Action` preserves the chosen mode while clearing entered state.

## 3. Verification

- [x] 3.1 Run the frontend test suite and production build (`cd web && npm test -- --run && npm run build`) and verify all tests and TypeScript/Vite compilation pass without errors.
- [x] 3.2 Run `go test ./...`, `go vet ./...`, and `gopls check` on Go files to satisfy repository verification requirements and confirm zero diagnostics.

# Tasks

## 1. Backend Already-Consumed Guard

- [x] 1.1 Update `handleConsumeItem` in `internal/api/items.go` to check if `prev.ConsumedOnDate != nil`, preserve the existing `consumed_on_date` without running an `UPDATE`, and return `{ "item": prev, "previous": prev, "already_consumed": true }` with `200 OK`; add an API test in `internal/api/api_test.go` verifying that consuming an already-consumed item preserves its original `consumed_on_date` and sets `already_consumed: true` (verify with `go test ./internal/api/...`)

## 2. Consume Scan Visual Flash & Already-Consumed Notice

- [x] 2.1 Add an optional `flashOnScan?: boolean` prop to `BarcodeScanner` (`web/src/components/BarcodeScanner.tsx`) that triggers a brief (`~280ms`, timer-cleaned) visual flash synced with `playBeep()` in `emitScan` — rendering a `pointer-events-none` flash overlay (`data-testid="scan-flash-overlay"`) over the camera viewfinder when enabled and a brief ring/highlight flash on the scanner bar — and pass `flashOnScan={mode === "consume"}` from `ScannerDrawer`; add tests in `web/src/components/Scanner.test.tsx` verifying the flash triggers on Consume scans and clears automatically (verify with `npm test` in `web/`)
- [x] 2.2 Update `handleConsumeOpenScan` in `web/src/components/ScannerDrawer.tsx` to check `res.item.consumed_on_date` when `res.kind === "item"`, skip calling `/consume` or `/open` when already consumed, clear any active undo toast, and display a notice containing the item's product name stating it was already consumed; add a test in `web/src/components/Scanner.test.tsx` covering an already-consumed item scan in Consume mode (verify with `npm test` in `web/`)

## 3. Items-First Staged Transfer Workflow

- [x] 3.1 Redesign `Transfer` mode in `web/src/components/ScannerDrawer.tsx` to maintain a visible staged `transferItems` list (cleared on mode switch, modal close, or transfer completion): scanning an in-stock `item` QR adds it directly (deduplicated), scanning an already-consumed `item` QR displays an already-consumed notice with the item's product name without staging it, scanning a `product` QR lists all in-stock items of that product for multi-select staging, scanning a retail `barcode` (UPC) filters `res.items` by `res.variant_id` to list only in-stock items of that variant for multi-select staging, and users can remove individual staged items; verify via unit tests in `web/src/components/Scanner.test.tsx` covering item staging, deduplication, already-consumed notice, product multi-select, UPC variant filtering, and item removal (`npm test` in `web/`)
- [x] 3.2 Update Transfer completion in `web/src/components/ScannerDrawer.tsx` so scanning a `location` QR immediately executes `POST /api/items/bulk` (`action: "transfer"`) for all staged `transferItems` (or prompts to scan items first when the list is empty), and selecting/keying in a destination location via `HierarchySelect` with a Transfer button completes the batch transfer, clears the staged list, invalidates inventory queries, and displays confirmation (including any `print_warnings`); add tests in `web/src/components/Scanner.test.tsx` covering both location-QR completion, manual location-picker completion, empty-list location scan prompt, and updated Transfer layout assertions (`npm test` in `web/`)

## 4. Integration Verification

- [x] 4.1 Run Go verification (`go test ./...`, `go vet ./...`, and `gopls check` on Go files) and frontend verification (`npm test` and `npm run build` in `web/`) and confirm all checks pass with zero errors or diagnostics

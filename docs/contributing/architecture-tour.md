---
title: Architecture tour
summary: Follow one barcode scan and purchase action from the React UI through the Go API and SQLite and back.
audience: developer
entry_point: under-the-hood
order: 3
capabilities:
  - barcode-scanning
  - inventory-catalog
screens: []
---

Follow what happens when a household member scans a UPC barcode in **Scan / Action** to record a purchase.

## 1. Camera or HID barcode scan (`web/src/components/ScannerDrawer.tsx`)

- `BarcodeScanner.tsx` decodes the barcode using self-hosted `zxing-wasm` (or reads keyboard input from a USB/Bluetooth scanner).
- `ScannerDrawer.tsx` posts the code to `POST /api/scan/resolve` via `web/src/api.ts`.

## 2. Resolution and optional lookup (`internal/api/workflows.go`)

- `Server.handleScanResolve` checks whether the code is an itemized QR URL (`/go/i/:id`, `/go/p/:id`, `/go/l/:id`) or a retail barcode stored in the `barcodes` table.
- If the retail barcode is unknown, the client calls `POST /api/upc/lookup` (`internal/upc`) and, when configured, `POST /api/upc/classify` (`internal/llm`) to suggest a standardized product name, category, and location.

## 3. Recording the purchase (`internal/api/workflows.go` & `internal/domain/`)

- Submitting the Purchase form sends `POST /api/workflows/purchase`.
- The handler creates or reuses the `products`, `variants`, and `barcodes` rows, calculates due dates using `internal/domain` (either rolling-average history or fixed `default_due_days`), inserts the new `items` rows in SQLite (`internal/db`), and auto-clears the manual shopping-list flag if stock now meets `min_stock`.

## 4. Label printing and UI refresh (`internal/printer/`)

- If the product's label mode is `per_item` or `per_product`, `internal/printer` renders the Go `text/template` ZPL layout and sends it over IPP or raw TCP `:9100` (skipped/simulated in `DEMO_MODE`).
- The API returns the created items and any printer warning. React Query invalidates `["products"]` and `["products", "counts"]`, updating the inventory list and sidebar badges immediately.

Run `make test` to execute the Go and Vitest suites covering every layer of this flow.

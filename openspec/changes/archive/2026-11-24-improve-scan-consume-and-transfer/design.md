# Design

## Context

See `proposal.md` for motivation and scope.

Current implementation details relevant to this change:
- `web/src/components/BarcodeScanner.tsx` owns the camera stream, decoding loops, manual/HID form input, 1500ms duplicate-scan debounce, and `playBeep()` inside `emitScan`.
- `web/src/components/ScannerDrawer.tsx` owns mode switching (`purchase`, `consume`, `open`, `transfer`, `inventory`) and dispatches resolved `/api/scan/resolve` payloads to mode-specific handlers (`handleConsumeOpenScan`, `handleTransferScan`, etc.).
- `internal/api/workflows.go` (`handleScanResolve`) already returns full `Item` metadata (including `consumed_on_date`, `product_name`, `variant_id`, `variant_name`, `location_name`, `due_on_date`) for `item`, `product`, and `barcode` resolutions. For `kind: "barcode"`, `items` currently contains all in-stock items of `productID`, each carrying its `variant_id`.
- `internal/api/items.go` (`handleConsumeItem`) currently unconditionally updates `consumed_on_date = today` even if the item was already consumed. `handleBulkItems` (`POST /api/items/bulk` with `action: "transfer"`) already transfers an arbitrary list of `item_ids` to `location_id`, applying freeze/thaw due-date calculations and label reprints via `transferSingleItem`.

## Goals / Non-Goals

**Goals:**
- Provide immediate visual flash confirmation paired with the audio beep on every registered scan in `Consume` mode.
- Prevent re-consumption of already-consumed items and surface a clear notice naming the item.
- Redesign `Transfer` mode into an items-first staged list workflow supporting item QRs, product QRs (all in-stock product items), and retail UPCs (all in-stock variant items), completed by scanning or keying in/selecting the destination location.

**Non-Goals:**
- No schema/database migrations or changes to `/api/scan/resolve` response format that could break existing `Purchase`, `Open`, or `Inventory` flows.
- No changes to `Purchase`, `Open`, or `Inventory Audit` workflows (beyond safely guarding against already-consumed items if scanned in `Open`).
- No undo toast overhaul for bulk transfers (existing confirmation banner + print warnings suffice for batch transfers).

## Decisions

### 1. Visual scan flash in `BarcodeScanner` via `flashOnScan` prop
- Add an optional `flashOnScan?: boolean` prop to `BarcodeScanner` (passed as `flashOnScan={mode === "consume"}` from `ScannerDrawer`).
- When `emitScan` accepts a non-debounced scan and `flashOnScan` is true, trigger a brief flash state (`~280ms`, reset via a ref-tracked timeout and cleaned up on unmount):
  - Render a `pointer-events-none` translucent emerald/white flash overlay inside the camera viewfinder container when `cameraEnabled` is true (with a `data-testid="scan-flash-overlay"` for testing).
  - Apply a brief emerald ring/highlight transition on the scanner input/bar container so users scanning with a desktop/HID scanner (camera off) also see the visual flash.
- **Alternative considered**: Triggering the flash in `ScannerDrawer` only after the `/api/items/:id/consume` network call returns. Rejected because network latency decouples the flash from the synchronous `playBeep()`, whereas the requirement is to accompany the beep so the user immediately knows the scan registered.

### 2. Already-consumed item handling (client check + idempotent backend)
- **Frontend (`ScannerDrawer.tsx`)**: In `handleConsumeOpenScan` (and `handleTransferScan`), when `res.kind === "item"` and `res.item.consumed_on_date` is truthy:
  - Do not call `POST /api/items/:id/consume` (or `open` / stage for transfer).
  - Clear any stale undo toast and set a clear notice naming the item: e.g., `${itemName} was already consumed (${res.item.consumed_on_date}).` (using `res.item.product_name || res.product.name`).
- **Backend (`internal/api/items.go`)**: In `handleConsumeItem`, check `if prev.ConsumedOnDate != nil`: skip the `UPDATE` so the original `consumed_on_date` is preserved, and return `200 OK` with `{ "item": prev, "previous": prev, "already_consumed": true }`.
- **Alternative considered**: Returning `409 Conflict` from `POST /api/items/:id/consume`. Rejected to keep the API backwards-compatible and idempotent for any direct callers while still exposing `already_consumed: true` and protecting the stored date.

### 3. Items-first staged Transfer workflow in `ScannerDrawer`
- **State**:
  - `transferItems: Item[]` — ordered list of staged in-stock items to transfer (deduplicated by `item.id`), cleared on mode switch (`resetSubState`), modal close, or transfer completion.
  - `transferDest: Location | null` — selected destination from `HierarchySelect` (for keying in/selecting a location).
  - Reuse `candidateItems: Item[]` and `selectedItemIds: number[]` (plus an optional `candidateTitle: string` header, e.g., `"Select items of <Product>"` or `"Select items of <Product> (<Variant>)"`) when a `product` QR or `barcode` (UPC) is scanned in Transfer mode.
- **Scan dispatch in `handleTransferScan`**:
  - `kind === "item"`:
    - If `res.item.consumed_on_date` is set → show already-consumed message with product name; do not add.
    - If `res.item.id` is already in `transferItems` → show status message that the item is already in the transfer list.
    - Else append `res.item` to `transferItems` and show status message (`Added ${res.item.product_name} to transfer list.`).
  - `kind === "product"`:
    - Use `res.items` (all unconsumed/in-stock items of that product, already ordered soonest due first).
    - If empty → show `"No in-stock items found for ${res.product.name}."`.
    - Otherwise populate `candidateItems` with `res.items`, pre-select the first item not already staged (or empty if all are already staged), and show a button `"Add to Transfer List (N)"` that appends selected items (deduplicated) into `transferItems` and clears `candidateItems`.
  - `kind === "barcode"` (UPC):
    - Filter `res.items` to `res.items.filter((it) => it.variant_id === res.variant_id)` so only in-stock items of that specific variant are shown.
    - If empty → show `"No in-stock items found for ${res.product.name} (${res.variant_name})."`.
    - Otherwise populate `candidateItems` with those variant items for multi-select staging into `transferItems`.
  - `kind === "location"`:
    - If `transferItems.length === 0` → show error/prompt `"Scan one or more items to transfer first."`.
    - Otherwise immediately call `executeTransfer(res.location)` which POSTs `{ action: "transfer", item_ids, location_id }` to `/api/items/bulk`, clears `transferItems`, `transferDest`, `candidateItems`, and `selectedItemIds`, invalidates inventory queries, and shows confirmation (`Transferred N item(s) to ${dest.hierarchy_name}` plus any `print_warnings`).
- **Keying in / selecting destination location**:
  - Keep the Transfer panel rendered in Transfer mode showing:
    1. The visible staged Transfer List (with item product name, variant name if present, current location, due date, and per-item Remove button; or an empty-state hint `"Scan item, product, or UPC barcodes to add items to transfer."`).
    2. The Destination Location picker (`HierarchySelect` with search/key-in support) and a `"Transfer (N)"` button (disabled when `transferItems.length === 0 || !transferDest`) that calls `executeTransfer(transferDest)`.
- **Alternative considered**: Auto-transferring immediately on `HierarchySelect` `onChange`. Rejected because users keying in/searching a dropdown could accidentally click the wrong location before finishing selection; an explicit Transfer button for manual selection paired with immediate completion on scanning a location QR gives both speed and safety.

## Risks / Trade-offs

- **Items without `variant_id` on UPC scan**: Legacy or unvarianted items (`variant_id: null`) will not match `it.variant_id === res.variant_id` when scanning a UPC. This is intentional per the requirement ("all in stock items of that variant"); users can still scan the product QR or item QR to transfer unvarianted items.
- **No per-item Undo toast after batch transfer**: Unlike single-item immediate transfer, a batch transfer can move many items from different source locations. Clearing the list and showing a clear summary banner (with source locations visible prior to confirming) avoids partial-undo ambiguity.
- **Timer cleanup in `BarcodeScanner`**: Rapid scans in Consume mode clear and restart the flash timeout via a ref and clear it on unmount to prevent stale state updates in tests or unmounted drawers.

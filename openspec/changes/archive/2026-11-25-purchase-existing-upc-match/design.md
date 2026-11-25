# Design

## Context

See `proposal.md` for motivation. Currently:
- `POST /api/scan/resolve` (`internal/api/workflows.go`) queries `barcodes` using only exact string equality (`WHERE b.barcode = ?`). In production data (`itemized.db`), most stored retail barcodes are 12-digit UPC-A codes alongside 13-digit EAN-13 and 8-digit EAN-8 codes. Camera decoders (`zxing-wasm` and native `BarcodeDetector`) and HID scanners commonly return a 13-digit EAN-13 (`"0" + upca`) for a 12-digit UPC-A barcode (or vice-versa).
- `BarcodeScanner` (`web/src/components/BarcodeScanner.tsx`) runs both `window.BarcodeDetector` (when present) and `zxing-wasm` concurrently, and debounces duplicate scans by exact string equality (`lastCodeRef.current.code === code`). If the two engines decode the same physical barcode as 12-digit UPC-A and 13-digit EAN-13 within 1500ms, both scans are emitted.
- `ScannerDrawer` (`web/src/components/ScannerDrawer.tsx`) handles `res.kind === "barcode"` in `handlePurchaseScan` without incrementing `lookupSeqRef.current` or clearing `lookupPhase`, `upcHint`, `classifyWarning`, `purchaseSearchHits`, or `secondBarcode`. A late response from an earlier in-flight lookup/classification can overwrite the matched product with `creatingNew = true`.

## Goals / Non-Goals

**Goals:**
- Resolve already-mapped retail barcodes reliably across equivalent UPC-A / EAN-13 / GTIN-14 leading-zero representations in `POST /api/scan/resolve` with exact-match priority.
- Guarantee Purchase mode never triggers OpenFoodFacts lookup or LLM classification for a matched variant barcode, and cleanly cancels/clears any in-flight or stale lookup/classification state when a known barcode/product/item is matched.
- Prevent dual/repeated scanner decodes of equivalent UPC-A / EAN-13 forms of the same physical barcode from firing twice within the debounce window.

**Non-Goals:**
- Migrating or rewriting existing stored barcode strings in SQLite `barcodes`.
- Implementing UPC-E to UPC-A mathematical zero-suppression expansion (not needed for the leading-zero UPC-A/EAN-13/GTIN-14 mismatch; can be added later if ever needed).
- Changing OpenFoodFacts lookup or LLM classification behavior for genuinely unknown barcodes.

## Decisions

### 1. Deterministic candidate list for retail barcode resolution in `handleScanResolve`
- **Decision**: Add a pure helper `retailBarcodeCandidates(raw string) []string` in `internal/api/workflows.go`. For any trimmed input:
  1. Always check exact `raw` first.
  2. If `raw` does not match exactly and consists solely of 6–14 ASCII digits, generate a small ordered set of leading-zero equivalent candidates (deduplicated, excluding `raw`):
     - Canonicalize `trimmed := strings.TrimLeft(raw, "0")` (if non-empty).
     - For standard GTIN/UPC/EAN lengths (`11`, `12`, `13`, `14`), include zero-padded forms of `trimmed` up to lengths `12`, `13`, and `14` (only when `len(trimmed) <= targetLen`), plus `trimmed` itself if `len(raw) <= 14 && len(trimmed) >= 6` (handles stored 11-digit or leading-zero-stripped codes).
     - Specifically, for a 13-digit EAN-13 starting with `0` (e.g. `0048121277079`), candidates include `048121277079` (12-digit UPC-A) and `00048121277079` (14-digit GTIN-14). For a 12-digit UPC-A (`048121277079`), candidates include `0048121277079` (13-digit EAN-13) and `00048121277079` (14-digit GTIN-14).
  3. Query `barcodes` with exact match first; only if `sql.ErrNoRows`, query candidate matches in deterministic preference order (preferring the first candidate in the ordered list).
- **Rationale**: Uses SQLite's existing `UNIQUE` index on `barcodes(barcode)` for O(log N) lookups with zero schema changes and zero risk of breaking non-numeric barcodes (QR URLs, arbitrary text). Exact match always wins if both forms somehow exist.
- **Alternatives considered**:
  - Normalizing all stored barcodes in a DB migration to 13 digits: risky for existing user expectations, breaks exact barcode display on product pages, and still requires normalizing incoming scans.
  - Using `LTRIM(b.barcode, '0') = ?` in SQL: forces a full table scan (cannot use the `UNIQUE` index on `barcode`) and could match unintended non-GTIN codes.

### 2. Cancel in-flight lookups and reset stale lookup state in `ScannerDrawer.handlePurchaseScan`
- **Decision**: In `handlePurchaseScan`, whenever `res.kind === "barcode"` (or `"product"` / `"item"`), immediately:
  - Increment `lookupSeqRef.current += 1` so any in-flight `/api/upc/lookup`, `/api/upc/classify`, or `/api/products` search promise discards its response on completion.
  - Reset `lookupPhase` to `"idle"`, `upcHint` to `null`, `classifyWarning` to `null`, `purchaseSearchHits` to `[]`, `secondBarcode` to `""`, `secondBarcodeQty` to `1`, and `purchaseBarcodeQty` to `res.barcode.default_quantity || 1` (for `kind === "barcode"`).
- **Rationale**: Eliminates race conditions where a quick/partial scan or prior unknown barcode lookup completes after a known barcode resolves and flips the UI back into create/classify mode.

### 3. Normalize numeric retail barcode key for duplicate-scan debounce in `BarcodeScanner`
- **Decision**: In `BarcodeScanner.tsx`, compute a debounce key helper `normalizeScanDebounceKey(code: string): string` used only for `lastCodeRef` comparison in `emitScan`: if `/^\d{11,14}$/.test(code)`, strip leading zeros (`code.replace(/^0+/, "") || code`) so `"048121277079"` and `"0048121277079"` produce the same debounce key within the 1500ms window, while still passing the original decoded `code` to `onScanRef.current(code)`.
- **Rationale**: Prevents dual-engine (`BarcodeDetector` + `zxing-wasm`) or rapid re-reads in equivalent UPC-A/EAN-13 formats from double-triggering `handleScan`, without mutating the scanned value passed to the backend.

## Risks / Trade-offs

- **[Risk] Two distinct products share the same non-zero digits differing only by leading-zero length (e.g. an 8-digit code and a 12-digit code)** → Mitigation: Restrict leading-zero expansion/stripping to GTIN-12/13/14 equivalence (11–14 digit codes) plus exact match first; do not pad an 8-digit EAN-8 to 12/13 digits. Checked against `itemized.db` (1,080 barcodes): zero leading-zero collisions exist.
- **[Risk] Barcode debounce treats two genuinely different codes as duplicates** → Mitigation: Only apply leading-zero normalization in the 1500ms debounce key for 11–14 digit numeric barcodes (UPC-A / EAN-13 / GTIN-14), matching the backend's equivalence rule.

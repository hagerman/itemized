# Design

## Context

See [proposal.md](proposal.md) for motivation. All backend endpoints for variants and barcodes (`POST /api/products/:id/variants`, `PATCH /api/variants/:id`, `DELETE /api/variants/:id`, `POST /api/variants/:id/barcodes`, `DELETE /api/barcodes/:id`) are already implemented in `internal/api/catalog.go`. This change is purely frontend in `web/src/`.

## Goals / Non-Goals

**Goals:**
- Zero horizontal scrolling and single-row header actions on `/products/:id` at mobile widths (e.g. 375px–430px).
- Full inline CRUD for variants and barcodes on `/products/:id`.
- Consistent `[Barcode input + Scan button] [Qty input]` single-row layout in both Purchase and Product Detail.
- Seamless scan-to-input capture reusing `<BarcodeScanner />` without duplicating camera logic.

**Non-Goals:**
- Backend API or SQLite schema changes.
- Editing individual item notes/dates inline inside the mobile card (bulk actions and existing controls remain unchanged).

## Decisions

### 1. Mobile Header Actions on `/products/:id`
- Keep the four action buttons (`Add to List`/`On List`, `Print Label`, `Edit`, `Delete`) in a single `flex items-center gap-1.5 shrink-0` row.
- Wrap button text in `<span className="hidden sm:inline">...</span>` and add `aria-label` + `title` on every button so mobile shows crisp icon-only buttons on one line while `sm+` viewports show icon + label.

### 2. Responsive `Items in Stock` (Mobile Cards + Desktop Table)
- **Mobile (`md:hidden`)**: Vertical stack of cards (`space-y-2.5`). Each card shows:
  - Top row: selection checkbox + `#id` + location name (truncated cleanly).
  - Middle row: compact date pills/grid (`Purchased`, `Opened`, `Due`) only wrapping cleanly within the card.
  - Bottom row: 3-column grid (`grid-cols-3 gap-2`) of `Open`, `Consume`, `Print` buttons so they never stack unevenly or overflow.
  - Include a compact "Select all" checkbox in the section header on mobile so bulk selection works seamlessly.
- **Desktop (`hidden md:block`)**: Keep the existing `<table>` with `whitespace-nowrap` on the Actions cell so buttons stay on one line.

### 3. Inline Variant & Barcode Management on `/products/:id`
- Add a `+ Add Variant` button in the `Variants & Barcodes` section header opening a compact inline form (variant name + optional measurement value & unit).
- Each variant card displays:
  - Header with variant name, optional measurement summary, and `Edit` / `Delete` icon buttons.
  - When editing: inline inputs for name + optional measurement (volume/weight/length value + unit) + `Save` / `Cancel`.
  - Existing barcodes rendered as chips with a remove (`×`) button calling `DELETE /api/barcodes/:id`.
  - Compact inline Add Barcode row: `[Barcode input + Scan icon button]` + `[Qty]` + `[Add]` calling `POST /api/variants/:id/barcodes`.

### 4. Scan-to-Field Capture
- **In `ScannerDrawer.tsx` (Purchase)**: Since `<BarcodeScanner />` is already mounted and active at the top of the drawer, introduce `scanTarget: null | "primary_barcode" | "second_barcode"`.
  - Clicking the scan button next to Primary Barcode or Second Barcode sets `scanTarget` (highlighting that field and showing a subtle `"Ready to scan into <field>..."` indicator with a Cancel button).
  - When `handleScan(raw)` fires while `scanTarget !== null`, it writes `raw.trim()` into the targeted barcode input, resets `scanTarget = null`, and returns without running `/api/scan/resolve`!
- **In `ProductDetailPage.tsx` (Add Barcode on a Variant)**: Clicking the scan button next to a variant's barcode input opens a compact `<BarcodeScanModal />` (reusing `<BarcodeScanner />` with camera enabled) that captures one scan, fills that variant's barcode input, and closes automatically.

### 5. Purchase Variant & Barcode Details Row Layout
- Replace the flat 2-column grid with a vertical stack (`space-y-2`):
  - Row 1: Full-width `Variant name (e.g. 16 oz)` input.
  - Row 2: `flex gap-2` with `[Primary barcode input + Scan button]` (`flex-1`) and `[Qty]` (`w-20`, labeled/placeholder `Qty`).
  - Row 3: `flex gap-2` with `[Second barcode input + Scan button]` (`flex-1`) and `[Qty]` (`w-20`).

## Risks / Trade-offs

- **Camera permission / multiple active streams** → In `ScannerDrawer`, reusing the already-mounted `<BarcodeScanner />` via `scanTarget` avoids opening a second camera stream. On `ProductDetailPage`, `<BarcodeScanModal />` mounts only while scanning and unmounts immediately upon capture.

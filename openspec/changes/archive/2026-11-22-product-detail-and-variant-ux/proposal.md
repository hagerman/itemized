# Proposal

## Why

On mobile viewports, `/products/:id` overflows awkwardly: the top action buttons wrap onto a second line, and the Items in Stock table forces horizontal scrolling with cramped action buttons. In addition, users currently have no UI to add, edit, or delete variants and barcodes on the product detail page, and the Purchase screen's Variant & Barcode Details layout splits each barcode and its pack quantity onto separate lines without a scan button to capture a barcode directly into a field.

## What Changes

- Make `/products/:id` cleanly responsive on mobile:
  - Collapse top action buttons (`Add to List`, `Print Label`, `Edit`, `Delete`) to compact icon-only buttons on narrow viewports (with accessible labels/tooltips) so they stay on a single row without wrapping.
  - Render `Items in Stock` as a vertical card list on mobile (no horizontal table scrolling, cleanly laid-out single-row actions) while keeping the full multi-column table with non-wrapping action buttons on desktop.
- Add full inline Variant & Barcode management on `/products/:id`: create, edit (name + optional measurement), and delete variants, and add/delete barcodes on any variant (with barcode + pack quantity on the same row and a scan button to capture a barcode).
- Redesign the Purchase workflow's Variant & Barcode Details section so each barcode input and its pack quantity sit side-by-side on the same row, with a scan button on each barcode field to capture a scanned barcode directly into that input.

## Capabilities

### New Capabilities
- `product-detail-responsive-ui`: Mobile-friendly `/products/:id` header actions and responsive Items in Stock layout (cards on mobile, table on desktop) with zero horizontal overflow.
- `variant-and-barcode-management`: Inline variant CRUD and barcode management on `/products/:id`, plus paired barcode-and-quantity rows with scan-to-fill support on both the product page and Purchase workflow.

### Modified Capabilities
<!-- None — `openspec/specs/` has no archived specs yet. -->

## Impact

- Frontend components in `web/src/pages/ProductDetailPage.tsx`, `web/src/components/ScannerDrawer.tsx`, and a lightweight reusable barcode-scan-to-input helper/modal in `web/src/components/`.
- No backend API or database schema changes required — `POST /api/products/:id/variants`, `PATCH /api/variants/:id`, `DELETE /api/variants/:id`, `POST /api/variants/:id/barcodes`, and `DELETE /api/barcodes/:id` already exist in `internal/api/catalog.go`.

# Proposal

## Why

Users who do not have any label printers configured still see `Print Label`, `Reprint Labels`, `Print`, and `Print Location Label` buttons across products, items, and locations, as well as `Label Mode` / `Label Print Mode` fields on product pages, product forms, and the Purchase scanner workflow. Omitting these printer-dependent controls when no printers are set up removes dead UI clutter and keeps everyday inventory workflows focused for households without a label printer.

## What Changes

- Expose a boolean `printers_enabled` flag on `GET /api/auth/status` so both `admin` and `member` clients know whether any printer is configured without exposing admin-only `/api/printers` data (returning `true` when at least one enabled printer exists in normal mode, or when at least one printer record exists in demo mode).
- Invalidate the `["auth-status"]` query whenever an admin adds or deletes a printer in Settings so label printing controls appear or disappear immediately without a page reload.
- Omit all label print action buttons across the web application when `printers_enabled` is `false`:
  - Product detail header `Print Label` button
  - Product detail bulk item actions bar `Reprint Labels` button
  - Product detail per-item `Print` button (both mobile cards and desktop table rows)
  - Locations list per-location `Print location label` icon button
  - Location detail header `Print Location Label` button
- Omit label printing mode UI on products and purchases when `printers_enabled` is `false`:
  - Product detail metadata summary `Label Mode` tile (adjusting summary grid columns cleanly)
  - Product create/edit form `Label Print Mode` selector (preserving existing or default `label_print_mode` on submit)
  - Purchase scanner form `Label Mode` selector (preserving existing or default `label_print_mode` on submit)
- Keep backend print endpoints, stored `label_print_mode` values, and Settings printer/template administration intact so configuring a printer later immediately restores all label UI controls.

## Capabilities

### New Capabilities

_(None)_

### Modified Capabilities

- `label-printing`: Expose printer availability via `GET /api/auth/status` (`printers_enabled`) and conditionally omit print-label buttons and label-print-mode UI controls across the application when no printers are configured.
- `web-ui`: Gate `Label Mode`, `Label Print Mode`, `Reprint Labels`, and location `Print Label` UI elements on printer availability (`printers_enabled`) across Product detail, Product form, Locations, Location detail, and Purchase scanner views.
- `product-detail-responsive-ui`: Omit the `Print Label` header button and per-item `Print` buttons on `/products/:id` when no printers are configured while preserving single-row header alignment and clean mobile card button layout.

## Impact

- **Backend**: `internal/api/server.go` (`handleAuthStatus`), `internal/api/api_test.go`, `internal/api/demo_test.go`
- **Frontend**: `web/src/api.ts` (`AuthStatus`), `web/src/pages/SettingsPage.tsx`, `web/src/pages/ProductDetailPage.tsx`, `web/src/pages/ProductFormPage.tsx`, `web/src/pages/TaxonomyPages.tsx`, `web/src/components/ScannerDrawer.tsx`, and their Vitest test suites.
- **Compatibility**: Additive boolean field on `GET /api/auth/status`; no breaking API or database schema changes.

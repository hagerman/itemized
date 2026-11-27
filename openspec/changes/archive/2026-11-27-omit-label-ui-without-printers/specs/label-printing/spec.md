# Spec Delta

## ADDED Requirements

### Requirement: Printer availability indicator
`GET /api/auth/status` SHALL include a boolean `printers_enabled` field indicating whether label printing is available (`true` when at least one enabled printer exists in standard mode, or when at least one printer record exists in demo mode; `false` otherwise) so both `admin` and `member` users can determine printer availability without accessing admin-only `/api/printers` endpoints.

#### Scenario: Auth status reports printers_enabled false when no printers exist
- **WHEN** a client requests `GET /api/auth/status` on a standard instance with zero enabled printers configured
- **THEN** the response includes `"printers_enabled": false` for both `admin` and `member` users

#### Scenario: Auth status reports printers_enabled true when an enabled printer exists
- **WHEN** an administrator configures an enabled printer and a client requests `GET /api/auth/status`
- **THEN** the response includes `"printers_enabled": true` for both `admin` and `member` users

#### Scenario: Demo mode reports printers_enabled true for the seeded sample printer
- **WHEN** a client requests `GET /api/auth/status` in demo mode while the seeded sample printer exists
- **THEN** the response includes `"printers_enabled": true`
- **AND** if all printers are deleted in demo mode, `GET /api/auth/status` returns `"printers_enabled": false`

### Requirement: Conditional label UI based on printer availability
When `printers_enabled` is `false`, the web application SHALL omit all print-label action buttons and all product/purchase label print mode displays and selectors outside Settings, while preserving backend print endpoints, stored `label_print_mode` values, and Settings printer administration. Adding or deleting a printer in Settings SHALL invalidate cached auth status so label controls update immediately without a reload.

#### Scenario: Adding or removing the last printer in Settings updates label UI immediately
- **WHEN** an administrator adds the first printer or deletes the last printer in Settings
- **THEN** the web application invalidates the cached `auth-status` query so print buttons and label print mode controls immediately appear or disappear across the application without a manual page refresh

#### Scenario: Preserving stored label_print_mode when hidden on edit or purchase
- **WHEN** `printers_enabled` is `false` and a user edits an existing product or submits a purchase in the Scanner drawer
- **THEN** the `Label Print Mode` / `Label Mode` selector is omitted from the UI and submitting the form preserves the product's existing `label_print_mode` (or default `"per_item"` for new products) without triggering print jobs

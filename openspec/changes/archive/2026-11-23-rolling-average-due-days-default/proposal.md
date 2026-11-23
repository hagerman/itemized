# Proposal

## Why

Most household products benefit from learning their typical shelf life automatically from recent purchases rather than requiring manual upfront estimates. Currently, "Calculate due date from rolling average of recent purchases" defaults to unchecked on new products, still lets users type a conflicting `Due Days` value when checked, and shows `—` instead of the live calculated average on the Product detail page.

## What Changes

- **Default rolling average ON for new products**:
  - Automatically check `Calculate due date from rolling average of recent purchases` (`use_average_for_due_date = true`) when creating a new product in `ProductFormPage.tsx` and in `ScannerDrawer.tsx` (Purchase mode new product creation).
- **Disable manual `Due Days` input when rolling average is checked**:
  - When `use_average_for_due_date` is checked, disable the `Due Days` input (preventing manual entry) and submit `default_due_days: null`.
- **Calculate and display `~X` rolling average due days on `/products/:id`**:
  - Extract and reuse the existing rolling-average calculation (`due_date_average_count` most recent purchases with both `purchased_on_date` and `due_on_date`) to expose `calculated_due_days` (`*int`) on `Product` responses when `use_average_for_due_date` is enabled.
  - Render `Default Due Days` on `/products/:id` as `~X` (e.g., `~14`) when `use_average_for_due_date` is enabled and a calculated average is available (or `—` when no qualifying purchase history exists yet).

## Capabilities

### New Capabilities
<!-- None — this refines existing inventory-catalog and web-ui capabilities. -->

### Modified Capabilities
- `inventory-catalog`: Expose `calculated_due_days` on `Product` using the existing rolling-average logic over the last `due_date_average_count` purchases when `use_average_for_due_date` is enabled.
- `web-ui`: Default `use_average_for_due_date` to checked on new products, disable manual `Due Days` entry while checked, and display calculated rolling-average due days as `~X` on the Product detail page.

## Impact

- Backend: `internal/domain/domain.go` (`CalculateRollingAverageDueDays`), `internal/api/items.go` (shared rolling-average offset query), `internal/api/catalog.go` (`Product.CalculatedDueDays`), and unit tests in `internal/api/api_test.go`.
- Frontend: `web/src/api.ts`, `web/src/pages/ProductFormPage.tsx`, `web/src/components/ScannerDrawer.tsx`, `web/src/pages/ProductDetailPage.tsx`, and unit tests in `web/src/pages/ProductDetailPage.test.tsx`.
- No database schema migrations required.

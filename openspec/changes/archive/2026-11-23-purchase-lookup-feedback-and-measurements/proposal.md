# Proposal

## Why

When scanning an unknown barcode in Purchase mode, the UI currently pauses silently while querying OpenFoodFacts and again while waiting for the LLM product classifier, giving no feedback that background lookups are in progress. In addition, the OpenFoodFacts product title is not pre-filled into the variant name field, and measurement fields (unit type, value, unit) extracted by the LLM classifier are neither populated nor editable in the Purchase flow or Product create/edit form.

## What Changes

- Display explicit loading indicators in the Purchase workflow for both async stages after scanning an unknown barcode:
  1. While querying OpenFoodFacts (`Looking up barcode in OpenFoodFacts...`)
  2. While running the optional LLM product classifier (`Classifying product...`) after the OpenFoodFacts title is shown
- Automatically populate the Purchase workflow's `Variant name` field with the product title returned by OpenFoodFacts (e.g., `"Pepsi Cola"`).
- Wire LLM-extracted measurement data (`product_value`, `product_unit_type`, `product_unit`) into tucked-away, expandable measurement controls so casual users aren't cluttered while power users can inspect and adjust measurements:
  - In the Purchase workflow: collapsible measurement inputs for the new product (and for the variant inside `Variant & Barcode Details`), pre-populated from LLM classification and persisted via `POST /api/workflows/purchase`.
  - In `ProductFormPage` (Create/Edit Product): collapsible `Measurement (Optional)` section allowing users to set, edit, or clear volume/weight/length on any product.
  - On `ProductDetailPage`: display the product's default measurement in the metadata summary when set.
- Extend `POST /api/workflows/purchase` in `internal/api/workflows.go` to accept and validate optional variant measurement fields when creating a variant during purchase.
- Tighten the LLM classifier prompt and server-side validation in `internal/llm/llm.go` so `product_unit_type` and `product_unit` strictly adhere to the canonical `domain.Valid*Units` enum values.

## Capabilities

### New Capabilities
<!-- None — this change refines existing capabilities. -->

### Modified Capabilities
- `barcode-scanning`: Add loading indicators during OpenFoodFacts lookup and LLM classification, pre-fill variant name from OpenFoodFacts title, and populate/persist optional product and variant measurements in the Purchase workflow.
- `web-ui`: Expose a collapsible optional measurement editor on the Product create/edit form and display the product's default measurement on the Product detail page.

## Impact

- Backend: `internal/api/workflows.go` (`handlePurchaseWorkflow` optional variant measurement fields) and `internal/api/api_test.go`.
- Frontend: `web/src/components/ScannerDrawer.tsx`, `web/src/pages/ProductFormPage.tsx`, `web/src/pages/ProductDetailPage.tsx`, and unit tests in `web/src/components/Scanner.test.tsx`.
- No database schema changes required (`products` and `variants` already have `volume_*`, `weight_*`, and `length_*` columns).

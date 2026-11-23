# Design: Purchase Lookup Feedback & Optional Measurements

## Context

In Purchase mode (`web/src/components/ScannerDrawer.tsx`), scanning an unknown retail barcode triggers two sequential network calls:
1. `POST /api/upc/lookup` (OpenFoodFacts lookup)
2. `POST /api/upc/classify` (optional LLM classification, returning `{ product_name, product_value, product_unit_type, product_unit, category_id }`)

Currently:
- Neither async call displays a loading indicator, causing silent multi-second pauses.
- `upcRes.result.title` is only rendered as a static hint banner and is not placed into `variantName`.
- The LLM's `product_value`, `product_unit_type`, and `product_unit` are ignored in the UI.
- `ProductFormPage.tsx` has no UI to view or edit a product's measurement fields, even though `products` and `variants` already have `volume_value/unit`, `weight_value/unit`, and `length_value/unit` columns in SQLite and full validation in `internal/domain/measurement.go`.
- `POST /api/workflows/purchase` (`internal/api/workflows.go`) accepts measurement fields on `new_product` (via `productInput`) but does not yet accept optional measurement fields when creating a new `Variant`.

## Goals / Non-Goals

**Goals:**
- Provide clear, non-blocking inline loading feedback for both the OpenFoodFacts lookup stage and the LLM classification stage.
- Pre-fill `variantName` from `upcRes.result.title` when an unknown barcode resolves in OpenFoodFacts.
- Keep measurement inputs tucked away inside collapsible sections by default so casual users are not overwhelmed, while pre-filling them from LLM classification and allowing edits on both Products and Variants.
- Persist optional variant measurements in `POST /api/workflows/purchase`.

**Non-Goals:**
- No database schema migrations (measurement columns already exist on `products` and `variants`).
- No changes to the `/api/upc/classify` JSON response shape (it already returns `product_value`, `product_unit_type`, and `product_unit`).
- No unit conversion or normalized comparison math.

## Decisions

### 1. Two-phase Purchase lookup state in `ScannerDrawer.tsx`
Track `lookupPhase: "idle" | "upc" | "classify"` in `ScannerDrawer`:
- Before calling `/api/upc/lookup`, set `lookupPhase = "upc"` and transition to the `confirm` step immediately (or render an inline status banner at the top of the `confirm` step) so the user immediately sees a spinner with `"Looking up barcode in OpenFoodFacts..."`.
- As soon as `/api/upc/lookup` resolves:
  - Populate `upcHint` (`OpenFoodFacts: <title> (<quantity>)`).
  - If `upcRes.result.title` is non-empty, set `variantName(upcRes.result.title)` (and `newProdName(upcRes.result.title)` as an immediate fallback before LLM classification finishes, if still blank).
  - Set `lookupPhase = "classify"` and call `/api/upc/classify`. While in `"classify"`, keep showing the OpenFoodFacts banner and render an inline spinner below it: `"Classifying product..."`.
- When `/api/upc/classify` finishes (or errors/is unconfigured), set `lookupPhase = "idle"` in a `finally` block.
- Guard against stale async responses using a scan request sequence counter (`lookupSeqRef`) so starting a new scan or resetting the purchase flow never overwrites newer form state.

### 2. Shared Measurement State & Collapsible UI Component
Extract the measurement unit constants and formatting/payload helpers (currently duplicated in `ProductDetailPage.tsx`) into a small shared module `web/src/components/MeasurementFields.tsx` (or `web/src/utils/measurements.ts` + `MeasurementFields.tsx`):
- **Type**: `MeasurementDraft = { type: "" | "volume" | "weight" | "length"; value: string; unit: string }`
- **Supported units** (matching `internal/domain/domain.go`):
  - `volume`: `ml`, `l`, `tsp`, `tbsp`, `fl_oz`, `cup`, `pt`, `qt`, `gal`
  - `weight`: `mg`, `g`, `kg`, `oz`, `lb`, `t`, `short_ton`
  - `length`: `mm`, `cm`, `m`, `km`, `in`, `ft`, `yd`, `mi`
- **Helpers**:
  - `measurementFromEntity(entity)` -> `MeasurementDraft`
  - `measurementFromLLM(value, unitType, unit)` -> `MeasurementDraft` (checks that `unitType` and `unit` match the canonical allowed lists)
  - `measurementToPayload(draft)` -> `{ volume_value, volume_unit, weight_value, weight_unit, length_value, length_unit }` (with `null` for unselected types)
  - `formatMeasurement(entity)` -> string (e.g. `67.63 fl_oz`)
- **UI**: Collapsible `<details>`-style toggle button `"Measurement (Optional)"` (collapsed by default, showing a subtle badge with the current measurement summary like `67.63 fl oz` in the toggle label when populated so the user can see what the LLM filled without taking vertical space).
  - Used in `ProductFormPage.tsx` (Create & Edit Product).
  - Used in `ScannerDrawer.tsx` inside the `Create New Product` block (for the new product's measurement) AND inside `Variant & Barcode Details` (for the variant's measurement).
  - When LLM returns a valid measurement, pre-populate both the new-product measurement draft and the variant measurement draft so whichever the user keeps or adjusts is ready.

### 3. Backend Purchase Workflow Variant Measurements
Extend `purchaseWorkflowReq` in `internal/api/workflows.go`:
```go
VariantVolumeValue *float64 `json:"variant_volume_value"`
VariantVolumeUnit  *string  `json:"variant_volume_unit"`
VariantWeightValue *float64 `json:"variant_weight_value"`
VariantWeightUnit  *string  `json:"variant_weight_unit"`
VariantLengthValue *float64 `json:"variant_length_value"`
VariantLengthUnit  *string  `json:"variant_length_unit"`
```
- Before starting the transaction, validate variant measurements with `domain.ValidateMeasurement(req.VariantVolumeValue, req.VariantVolumeUnit, req.VariantWeightValue, req.VariantWeightUnit, req.VariantLengthValue, req.VariantLengthUnit)`.
- When inserting a new variant in `handlePurchaseWorkflow`, include `volume_value, volume_unit, weight_value, weight_unit, length_value, length_unit` in the `INSERT INTO variants` statement.
- All fields are optional (`nil` by default), preserving full backwards compatibility.

### 4. Product Detail Page Display
In `web/src/pages/ProductDetailPage.tsx`, add a `Measurement` stat tile in the top metadata grid when `formatMeasurement(product)` is non-empty (and reuse the shared `MEASUREMENT_UNITS` / `formatMeasurement` helpers for the existing variant editor).

### 5. Canonical Unit Prompt & Validation in `internal/llm/llm.go`
Update `buildPrompt` in `internal/llm/llm.go` to instruct the model explicitly to return ONLY exact canonical enum strings from the allowed lists (never display labels or variants like `"fl oz"`, `"liters"`, or `"pounds"`). In `Classifier.Classify`, validate `out.ProductUnitType` and `out.ProductUnit` against `domain.ValidVolumeUnits`, `domain.ValidWeightUnits`, and `domain.ValidLengthUnits` (mirroring the existing `out.CategoryID` validation) and clear invalid measurement tuples to `nil` so the frontend always receives canonical units or `null`.

## Risks / Trade-offs

- **User starts editing while LLM is still classifying**: Only overwrite `newProdName`, `newProdCatId`, or measurement drafts from the LLM response if the user hasn't manually edited them yet (and gate on the active `lookupSeqRef`). Tracking `userEditedNameRef` / `userEditedMeasurementRef` avoids clobbering user input if they type while the spinner is active.

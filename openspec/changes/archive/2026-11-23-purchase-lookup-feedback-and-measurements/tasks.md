# Tasks

## 1. Backend Purchase Variant Measurements & Classifier Prompt

- [x] 1.1 Tighten `buildPrompt` in `internal/llm/llm.go` to require exact canonical `product_unit_type` and `product_unit` enum values matching `internal/domain/domain.go`, validate returned measurement units in `Classifier.Classify` (clearing invalid unit tuples to `nil`), and add/update unit tests in `internal/llm/llm_test.go`; verify with `go test -v ./internal/llm/...`.
- [x] 1.2 Extend `purchaseWorkflowReq` and `handlePurchaseWorkflow` in `internal/api/workflows.go` to accept optional variant measurement fields (`variant_volume_value/unit`, `variant_weight_value/unit`, `variant_length_value/unit`), validate them with `domain.ValidateMeasurement`, and persist them when creating a new variant; add unit tests in `internal/api/api_test.go` covering valid persistence and invalid measurement rejection, and verify with `go test -v ./internal/api/...`.

## 2. Shared Measurement Component & Product Views

- [x] 2.1 Extract measurement constants, LLM normalization (`measurementFromLLM`), entity conversion (`measurementFromEntity` / `measurementToPayload`), formatting (`formatMeasurement`), and a collapsible `MeasurementFields` component into `web/src/components/MeasurementFields.tsx`; verify with `cd web && ./node_modules/.bin/tsc --noEmit`.
- [x] 2.2 Add the collapsible `Measurement (Optional)` section to `web/src/pages/ProductFormPage.tsx` (loading existing product measurements on edit and sending measurement fields on create/update) and display the formatted product measurement in the metadata summary on `web/src/pages/ProductDetailPage.tsx` (reusing shared helpers for the existing variant editor); verify with `cd web && ./node_modules/.bin/tsc --noEmit`.

## 3. Purchase Workflow Loading Indicators, Variant Name & Measurements

- [x] 3.1 Update `web/src/components/ScannerDrawer.tsx` Purchase mode to track two-phase `lookupPhase` (`"upc"` / `"classify"` / `"idle"`) with inline loading indicators (`Looking up barcode in OpenFoodFacts...` and `Classifying product...`), guard against stale async responses, pre-fill `variantName` from `upcRes.result.title`, pre-populate collapsible product and variant `MeasurementFields` from LLM classification (`product_value`, `product_unit_type`, `product_unit`), and submit both product and variant measurements to `POST /api/workflows/purchase`.
- [x] 3.2 Add Vitest tests in `web/src/components/Scanner.test.tsx` verifying the two-phase loading indicators, `Variant name` pre-fill from OpenFoodFacts, and LLM measurement pre-fill and submission; verify with `cd web && ./node_modules/.bin/vitest run --pool=forks && ./node_modules/.bin/tsc --noEmit && ./node_modules/.bin/vite build` and `go test ./... && go build ./...`.

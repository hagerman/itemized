# Tasks

## 1. Shared Numeric Input Component & Math Parser

- [x] 1.1 Create `web/src/components/NumberInput.tsx` exporting `normalizeNumericString`, `evaluateMathExpression` (safe recursive-descent parser for `+`, `-`, `*`, `/`, `×`, `÷`, unary `+/-`, and parentheses), `NumberInput` (`<input type="text">` required `number`-backed input with internal string draft, leading-zero stripping, live math commit + blur/Enter resolution, `ArrowUp`/`ArrowDown` stepping, external `value` prop sync, and blur restoration/clamping), and `OptionalNumberInput` (optional `string`-backed input with the same editing and math resolution while allowing `""` on blur), and verify TypeScript compilation via `npm --prefix web run build`
- [x] 1.2 Add unit tests in `web/src/components/NumberInput.test.tsx` covering clearing `1` to `""` without snapping to `0`, replacing `1` → `""` → `2` without `"02"`, leading-zero normalization (`"02"` → `"2"`, `"0"` preserved, `"0.5"` preserved, `"00.5"` → `"0.5"`), inline math evaluation (`500/5` → `100`, `16.9*6` → `101.4`, `0.1+0.2` → `0.3`, `(10+2)/3` → `4`, integer rounding `5/2` → `3`, clamping, division by zero `500/0`, malformed expressions `500/`), `ArrowUp`/`ArrowDown` stepping, blur fallback/clamping on required fields, empty retention on optional fields, and external prop resets, and verify with `npm --prefix web test -- NumberInput.test.tsx`

## 2. Migrate Quantity and Scanner Numeric Inputs

- [x] 2.1 Replace raw `<input type="number">` fields in `web/src/components/ScannerDrawer.tsx` (`purchaseQty`, `purchaseBarcodeQty`, `secondBarcodeQty`, `invScannedProducts` item quantities with `NumberInput min={1}`; `newProdDueDays` with `OptionalNumberInput`), update existing `.toHaveValue(1)` assertions in `web/src/components/Scanner.test.tsx` to `.toHaveValue("1")`, and verify `npm --prefix web test -- Scanner.test.tsx` passes
- [x] 2.2 Add regression tests in `web/src/components/Scanner.test.tsx` verifying that clearing Purchase `Quantity` (and pack quantity) from `1` to empty and entering `2` does not snap to `0` or format as `"02"`, restores `1` on blur if left empty, evaluates simple math expressions (e.g., `2*6` → `12` in quantity and `500/5` → `100` in measurement), and submits the resolved values, and verify with `npm --prefix web test -- Scanner.test.tsx`

## 3. Standardize Remaining Form Numeric Inputs

- [x] 3.1 Migrate `web/src/pages/ProductDetailPage.tsx` (variant barcode `draft.qty` to `NumberInput min={1}`; `newVariantMVal` and `editVariantMVal` to `OptionalNumberInput allowDecimal`), `web/src/components/MeasurementFields.tsx` (measurement value to `OptionalNumberInput allowDecimal`), `web/src/pages/ProductFormPage.tsx` (`dueDays`, `openDays`, `freezeDays`, `thawDays`, `minVal` to `OptionalNumberInput`), and `web/src/pages/SettingsPage.tsx` (`avgCount` to `NumberInput min={1} fallback={3}`), and verify all frontend tests pass with `npm --prefix web test`

## 4. Integration and Full Verification

- [x] 4.1 Run the full frontend test suite (`npm --prefix web test`) and production build (`npm --prefix web run build`) and verify zero errors
- [x] 4.2 Run `go test ./...`, `go vet ./...`, and `gopls check` on Go files (resolving `gopls` from `PATH` or `$(go env GOPATH)/bin/gopls`) and verify all checks pass cleanly

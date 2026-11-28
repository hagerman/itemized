# Proposal

## Why

Several numeric inputs in the web UI (such as Purchase `Quantity`, primary and second pack quantities, Inventory Audit product quantities, and variant barcode pack quantities) store their state as `number` and coerce `e.target.value` with `Number(...)` on every keystroke. When a user backspaces `1` to type `2`, the empty input immediately snaps to `0` (`Number("") === 0`), so typing `2` produces `"02"` and makes replacing values frustrating on both desktop and mobile. Additionally, users frequently need quick inline calculations when entering measurements or quantities (such as typing `500/5` ml for a 5-pack or `16.9*6` fl oz), which native `<input type="number">` inputs reject.

## What Changes

- Introduce a shared, reusable numeric input module (`web/src/components/NumberInput.tsx`) built on `<input type="text">` that manages an internal string editing draft so users can freely clear a numeric field without it snapping to `0` and can type arithmetic operators on both desktop and mobile.
- Support evaluating simple inline arithmetic expressions (`+`, `-`, `*`, `/`, parentheses, whitespace, and `×`/`÷`) via a safe, zero-dependency parser, live-committing valid evaluated values and resolving the displayed input on blur or Enter (with rounding/clamping for integer fields and floating-point cleanup for decimal fields), while handling invalid expressions and division by zero safely.
- Strip redundant leading zeros (e.g., `"02"` → `"2"`, while preserving `"0"` and decimal values like `"0.5"`), preserve desktop `ArrowUp`/`ArrowDown` stepping, and restore/clamp required positive-integer fields (such as quantities and rolling-average count) to a valid fallback/minimum on blur while letting optional fields remain empty.
- Migrate all number-backed quantity inputs (`ScannerDrawer` purchase quantity, primary/second pack quantities, inventory audit scanned product quantities; `ProductDetailPage` variant barcode pack quantity) and standardize the remaining numeric inputs (`ProductFormPage`, `SettingsPage`, `MeasurementFields`, `ProductDetailPage` variant measurement inputs, `ScannerDrawer` new-product due days) to use the shared components.
- Add unit and component tests covering clearing, replacing (`1` → backspace → `2` without `0` or `"02"`), leading-zero normalization, inline math evaluation (valid expressions, rounding, division by zero, malformed expressions), blur fallback/clamping, optional empty values, and programmatic external resets.

## Capabilities

### New Capabilities

### Modified Capabilities
- `web-ui`: Add a requirement defining consistent numeric input editing, empty-state handling while focused, leading-zero normalization, safe inline arithmetic evaluation, and blur restoration/clamping for required numeric fields across all numeric form controls in the web application.

## Impact

- Affected frontend files:
  - New: `web/src/components/NumberInput.tsx` and `web/src/components/NumberInput.test.tsx`
  - Updated: `web/src/components/ScannerDrawer.tsx`, `web/src/components/MeasurementFields.tsx`, `web/src/pages/ProductDetailPage.tsx`, `web/src/pages/ProductFormPage.tsx`, `web/src/pages/SettingsPage.tsx`
  - Tests: `web/src/components/Scanner.test.tsx` (updating `.toHaveValue(1)` assertions to `.toHaveValue("1")` for text-backed inputs and adding editing/math regression tests) and `web/src/components/NumberInput.test.tsx`
- No backend Go API changes, database migrations, or external dependencies are required.

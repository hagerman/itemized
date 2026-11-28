# Spec Delta

## ADDED Requirements

### Requirement: Numeric input editing and normalization
Numeric form inputs across the web application SHALL allow users to clear the current value while editing without coercing an empty field to `0`, SHALL strip redundant leading zeros while preserving `"0"` and decimal values, SHALL safely evaluate simple arithmetic expressions (`+`, `-`, `*`, `/`, parentheses) to their numeric result on blur or submit, and SHALL restore required positive-integer fields to a valid value on blur while letting optional fields remain empty.

#### Scenario: Replacing a default quantity of 1 with 2 without snapping to 0
- **WHEN** a user focuses a required quantity field whose current value is `1` (such as Purchase `Quantity`, primary or second pack quantity, Inventory Audit scanned product quantity, or Variant barcode pack quantity), clears the field with Backspace, and types `2`
- **THEN** clearing the field displays an empty input instead of snapping to `0`, typing `2` results in `"2"` rather than `"02"`, and the form reflects and submits `2`

#### Scenario: Clearing a required positive-integer field and blurring restores a valid value
- **WHEN** a user clears a required positive-integer field (such as Purchase `Quantity` with minimum `1`, or `Due Date Rolling Average Count` with minimum `1`) and moves focus away without entering a new number
- **THEN** the field restores a valid value meeting its minimum constraint (such as `1` for quantities or the fallback default for rolling-average count) instead of remaining `0` or invalid

#### Scenario: Entering a value with redundant leading zeros normalizes cleanly
- **WHEN** a user types or pastes `"02"` into an integer numeric field (or `"00.5"` into a decimal measurement field)
- **THEN** redundant leading zeros are stripped so the field displays `"2"` (or `"0.5"` for decimals), while standalone `"0"` and `"0.5"` remain valid where allowed

#### Scenario: Evaluating a simple arithmetic expression in a measurement or quantity field
- **WHEN** a user enters `"500/5"` into a measurement value field (or `"2*6"` into a Purchase `Quantity` field) and blurs the field or submits the form
- **THEN** the expression resolves to `"100"` (or `"12"` for `2*6`), the displayed value updates to the resolved number on blur, and the form submits `100` (or `12`)

#### Scenario: Rounding and clamping evaluated arithmetic expressions
- **WHEN** a user enters an arithmetic expression whose result has decimals into an integer field (such as `"5/2"` in a quantity field) or a floating-point expression into a decimal field (such as `"0.1+0.2"` or `"100/3"` in a measurement field) and blurs
- **THEN** integer fields round to the nearest integer and clamp to their minimum constraint (e.g., `"5/2"` → `"3"`, `"1-5"` → `"1"` when `min` is `1`), and decimal fields clean floating-point noise (e.g., `"0.1+0.2"` → `"0.3"`, `"100/3"` → `"33.3333"`)

#### Scenario: Invalid expressions and division by zero fail safely
- **WHEN** a user enters an incomplete or invalid expression such as `"500/"`, `"abc"`, or `"500/0"` and moves focus away
- **THEN** no `NaN` or `Infinity` value is committed: required numeric fields restore their fallback or last valid value, and optional numeric fields restore their last valid value (or empty `""` if unset)

#### Scenario: Optional numeric fields remain clearable
- **WHEN** a user clears an optional numeric field (such as `Due Days`, `On Open (days)`, `On Freeze (days)`, `On Thaw (days)`, `Minimum Stock`, or a measurement value) and moves focus away
- **THEN** the field remains empty (`""`) and submits as unset/`null`

#### Scenario: Programmatic resets update displayed numeric value
- **WHEN** the application programmatically resets or populates a numeric field (such as Purchase `Quantity` resetting to `1` after submitting a purchase or scanning a new unknown barcode, or populating a scanned barcode's `default_quantity`)
- **THEN** the displayed input value updates immediately to match the new programmatic value

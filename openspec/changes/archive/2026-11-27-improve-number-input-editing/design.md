# Design

## Context

See `proposal.md` for motivation. Across `web/src/`, there are 15 `<input type="number">` fields:
- **5 number-backed quantity fields** that currently run `onChange={(e) => setX(Number(e.target.value))}`:
  - `ScannerDrawer.tsx`: `purchaseQty`, `purchaseBarcodeQty`, `secondBarcodeQty`, and `invScannedProducts[i].quantity`
  - `ProductDetailPage.tsx`: `barcodeDrafts[vid].qty`
- **1 required string-backed integer field**:
  - `SettingsPage.tsx`: `avgCount` (`min={1}`, falls back to `3` on submit)
- **9 optional string-backed numeric fields**:
  - `ScannerDrawer.tsx`: `newProdDueDays` (integer)
  - `ProductFormPage.tsx`: `dueDays`, `openDays`, `freezeDays`, `thawDays`, `minVal` (integers)
  - `MeasurementFields.tsx`: `value.value` (decimal, `step="any"`)
  - `ProductDetailPage.tsx`: `newVariantMVal`, `editVariantMVal` (decimals, `step="any"`)

Supporting inline math expressions (such as `500/5` or `16.9*6`) requires accepting operator characters (`+`, `-`, `*`, `/`, `(`, `)`) that native `<input type="number">` rejects in browsers.

## Goals / Non-Goals

**Goals:**
- Provide a single, reusable numeric input module (`web/src/components/NumberInput.tsx`) that eliminates the empty-to-zero snap and `"02"` formatting bug for all number-backed fields.
- Safely evaluate simple arithmetic expressions (`+`, `-`, `*`, `/`, parentheses, `×`/`÷`) across all numeric inputs without `eval` or external dependencies.
- Standardize leading-zero normalization, rounding/clamping, and desktop `ArrowUp`/`ArrowDown` stepping across both required and optional numeric inputs.

**Non-Goals:**
- Changing backend API schemas or validation logic.
- Supporting advanced math functions (`sin`, `sqrt`, variables, exponents, etc.) beyond basic four-function arithmetic and parentheses.
- Replacing inputs with custom +/- stepper buttons or changing form layout/styling classes.

## Decisions

### 1. Use `<input type="text">` with internal string draft and keyboard stepping
**Decision:** Render `<input type="text">` (without a digit-only `inputMode`) and hold the displayed text in local string state (`draft`) inside `NumberInput` and `OptionalNumberInput`. Handle `ArrowUp` and `ArrowDown` in `onKeyDown` to increment/decrement by `1` (respecting `min`/`max`).
**Rationale:**
- Native `<input type="number">` rejects `/`, `*`, `+`, and `(` characters in browsers, making inline math impossible, and iOS `inputMode="numeric"` / `"decimal"` hides operator keys on the virtual keyboard.
- Using `<input type="text">` gives full control over empty states, leading-zero normalization, and arithmetic expressions across desktop and mobile browsers.
- Handling `ArrowUp`/`ArrowDown` preserves desktop numeric stepping ergonomics.
**Alternatives considered:**
- *Keeping `<input type="number">`*: Cannot accept `/` or `*`, so inline math like `500/5` would not work.
- *Adding `inputMode="decimal"`*: On iOS Safari, `inputMode="decimal"` only displays `0-9` and `.`, blocking users from typing `/` or `*` on mobile.

### 2. Safe zero-dependency recursive-descent arithmetic parser
**Decision:** Implement `evaluateMathExpression(raw: string): number | null` in `web/src/components/NumberInput.tsx` using a small recursive-descent parser:
- Normalize `×` → `*` and `÷` → `/`, ignore whitespace.
- Grammar:
  - `expr := term (('+' | '-') term)*`
  - `term := unary (('*' | '/') unary)*`
  - `unary := ('+' | '-') unary | primary`
  - `primary := number | '(' expr ')'`
- Return `null` on empty input, unexpected tokens, mismatched parentheses, division by zero, `NaN`, or non-finite results (`Infinity`, `-Infinity`).
**Rationale:** Completely safe (no `eval` or `Function`), deterministic, tiny (~50 lines), and handles standard operator precedence and parentheses cleanly.

### 3. Separate `NumberInput` (required `number`) and `OptionalNumberInput` (optional `string`)
**Decision:** Export two focused components from `web/src/components/NumberInput.tsx`:
- `NumberInput`: Accepts `value: number`, `onChange: (value: number) => void`, optional `min`, `max`, `fallback` (defaults to `min ?? 1`), `allowDecimal` (default `false`), and standard `<input>` props.
  - **On change:**
    - If `raw === ""`, set `draft("")` and do **not** call `onChange(0)`.
    - If `raw` is a plain number (no arithmetic operators), normalize redundant leading zeros (`normalizeNumericString`) so `"02"` immediately becomes `"2"`.
    - If `raw` contains an arithmetic expression, keep `raw` in `draft` so typing `"500/50"` does not jump mid-entry.
    - Evaluate `raw` with `evaluateMathExpression`; if valid and within `[min, max]` (after integer rounding when `!allowDecimal` or `Number(n.toFixed(4))` when `allowDecimal`), live-commit `onChange(resolved)` so button labels (e.g., `Confirm & Add (100)`) and Enter-key submissions reflect the resolved number immediately.
  - **On blur (and Enter):**
    - Resolve `draft` via `evaluateMathExpression`.
    - If valid: format via `formatResolvedNumber` (`Math.round` for integers, `Number(n.toFixed(4))` for decimals), clamp to `[min, max]`, update `draft` to `String(clamped)`, and call `onChange(clamped)` if changed.
    - If empty or invalid (e.g. `"500/"`, `"500/0"`, `"abc"`): restore `next = fallback ?? min ?? value`, set `draft(String(next))`, and call `onChange(next)` if changed.
  - **External prop sync:**
    - Sync `draft` to `String(value)` whenever the parent `value` prop changes externally (tracked against the last committed value so typing `"500/5"` does not immediately overwrite `draft` with `"100"` before blur).
- `OptionalNumberInput`: Accepts `value: string`, `onChange: (value: string) => void`, `allowDecimal?: boolean` (default `false`), optional `min`, `max`, and standard `<input>` props.
  - Keeps internal `draft: string` synced with `value`.
  - When cleared to `""`, sets `draft("")` and commits `onChange("")`, remaining empty on blur.
  - Normalizes leading zeros for plain numeric input, live-commits evaluated math results as strings (while keeping the raw expression in `draft` until blur/Enter), and on blur resolves valid expressions (or restores the last valid `value` / `""` if invalid).

**Rationale:** Strongly typed props match existing caller state (`number` for quantities/counts, `string` for optional nullable form fields) and guarantee that submitting a form via Enter without blurring still submits the resolved number rather than an unparsed expression string.

### 4. Leading-zero and decimal formatting rules
**Decision:**
- `normalizeNumericString(raw: string): string`: `raw.replace(/^(-?)0+(?=\d)/, "$1")` (`"02"` → `"2"`, `"00"` → `"0"`, `"0"` → `"0"`, `"0.5"` → `"0.5"`, `"00.5"` → `"0.5"`). Applied only to plain numeric strings (not mid-expression strings like `"500/05"` until evaluated).
- `formatResolvedNumber(n: number, allowDecimal: boolean): number`:
  - Integer (`!allowDecimal`): `Math.round(n)` (converting `-0` to `0`).
  - Decimal (`allowDecimal`): `Number(n.toFixed(4))` (strips trailing zeros and eliminates IEEE-754 artifacts such as `0.1 + 0.2 = 0.30000000000000004`).

## Risks / Trade-offs

- **[Existing `Scanner.test.tsx` assertions use `.toHaveValue(1)`]** → `@testing-library/jest-dom`'s `.toHaveValue(number)` only matches `<input type="number">`. Mitigation: update the 6 `.toHaveValue(1)` assertions in `Scanner.test.tsx` to `.toHaveValue("1")` alongside adding new editing and math regression tests.
- **[Mobile virtual keyboard opens standard keyboard instead of digit-only keypad]** → Required so iOS/Android users can type `/` and `*` for inline math. Mitigation: tapping `123` on mobile keyboards immediately exposes digits alongside `+ - * / . ( )`, and `autoComplete="off"` / `spellCheck={false}` keeps mobile autocomplete out of the way.
- **[Live-commit vs. `draft` sync while typing an expression]** → If typing `"500/5"` calls `onChange(100)`, the parent passes `value={100}` back on re-render; a naive `useEffect([value])` would replace `"500/5"` with `"100"` before the user can type `"0"` for `"500/50"`. Mitigation: record `lastCommittedRef.current = resolved` right before calling `onChange(resolved)` and skip overwriting `draft` in `useEffect([value])` when `value === lastCommittedRef.current`.

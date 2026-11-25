# Proposal

## Why

In the `Scan & Action` modal (`ScannerDrawer`), the default `Purchase` mode renders 16px taller than `Consume` and `Open` modes even when idle with no search hits, lookup indicators, or forms displayed. This happens because `ScannerDrawer` unconditionally renders an empty `<div className="space-y-3">` wrapper for `mode === "purchase"` inside a `space-y-4` body container, adding a spurious `margin-top: 1rem` below the scanner bar and causing a visible vertical jump when switching between modes that have no extra controls.

## What Changes

- Only render the Purchase workflow container in `ScannerDrawer` when at least one Purchase-mode sub-element (UPC lookup status, OpenFoodFacts hint, LLM classification status/warning, matching product hits, or the product creation/confirmation form) is active.
- Ensure all `Scan & Action` modes without default mode-specific controls (`Purchase`, `Consume`, `Open`) share the same compact default height, while modes with default mode-specific controls (`Transfer` destination picker, `Inventory` audit location picker) naturally expand to fit their controls.
- Add a regression test verifying that idle `Purchase` mode does not render an empty workflow container below the scanner bar and matches the idle structure of `Consume` and `Open` modes.

## Capabilities

### New Capabilities
<!-- None -->

### Modified Capabilities
- `barcode-scanning`: Clarify `Shared live scanner with mode switching` so idle modes without additional default controls (`Purchase`, `Consume`, `Open`) render at the same compact height without extra empty spacing, while modes with default controls (`Transfer`, `Inventory`) expand only to accommodate those controls.

## Impact

- Frontend component: `web/src/components/ScannerDrawer.tsx`
- Frontend tests: `web/src/components/Scanner.test.tsx`
- No backend, database, or API changes.

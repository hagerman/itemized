# Proposal

## Why

On iOS Safari and standalone iOS PWAs, the `Due Date` `<input type="date">` field in the `Scan & Action` Purchase form overflows its CSS Grid column and renders behind the adjacent `Label Mode` `<select>` control. Additionally, native `<input type="date">` and `<select>` controls lack `color-scheme: dark` and consistent height normalization on iOS, causing mismatched field heights and low-contrast dark-on-dark native select chevrons.

## What Changes

- Normalize `<input type="date">` sizing and appearance globally in `web/src/index.css` (`min-width: 0`, `max-width: 100%`, `-webkit-appearance: none; appearance: none;`, left-aligned `::-webkit-date-and-time-value`) and declare `color-scheme: dark` on `:root` so native iOS date pickers and select controls respect dark-mode contrast and never overflow narrow containers.
- Constrain all grid cells and form controls in the `Scan & Action` Purchase confirmation grid (`Quantity`, `Location`, `Due Date`, `Label Mode` in `web/src/components/ScannerDrawer.tsx`) with `min-w-0` on grid items and `min-w-0 max-w-full` plus uniform `h-10` control heights (including `HierarchySelect` trigger alignment in `web/src/components/HierarchySelect.tsx`) so `Due Date` never overlaps `Label Mode` and all four controls align cleanly on iOS and desktop.
- Add unit tests in `web/src/pwa.test.ts` and `web/src/components/Scanner.test.tsx` verifying the global iOS date-input/color-scheme CSS rules and the Purchase form grid's `min-w-0` / `max-w-full` / uniform-height layout classes.

## Capabilities

### New Capabilities

### Modified Capabilities
- `web-ui`: Add iOS and mobile form control layout requirements ensuring `<input type="date">` and adjacent grid controls stay within their column bounds without overlapping, maintain consistent control heights, and use dark `color-scheme` for native form chrome.

## Impact

- Affected frontend code: `web/src/index.css`, `web/src/components/ScannerDrawer.tsx`, `web/src/components/HierarchySelect.tsx`, `web/src/pwa.test.ts`, `web/src/components/Scanner.test.tsx`
- Embedded frontend build: `web/dist` (rebuilt via `npm run build` so the Go binary serves the updated bundle)
- No backend API, database, or dependency changes.

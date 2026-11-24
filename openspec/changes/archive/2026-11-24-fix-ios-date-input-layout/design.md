# Design

## Context

See `proposal.md` for motivation. On iOS WebKit/Safari, `<input type="date">` carries a UA intrinsic minimum width and native appearance chrome (`-webkit-appearance`) that ignores narrow CSS Grid column widths unless both the grid item and the input itself are constrained (`min-width: 0`, `max-width: 100%`, `appearance: none`). In `web/src/components/ScannerDrawer.tsx`, the Purchase confirmation grid (`grid grid-cols-2 gap-3 sm:grid-cols-4`) places `Quantity`, `Location` (`HierarchySelect`), `Due Date` (`<input type="date">`), and `Label Mode` (`<select>`) side by side, with no `min-w-0` on grid cells and no global `input[type="date"]` normalization or `color-scheme: dark` in `web/src/index.css`. Furthermore, `web/src/index.css` already applies `font-size: 16px` on iOS/coarse pointers to prevent focus zoom, so fixed control heights must comfortably accommodate `16px` text.

## Goals / Non-Goals

**Goals:**
- Prevent `<input type="date">` from overflowing its CSS Grid column or overlapping adjacent controls on iOS Safari and standalone iOS PWAs.
- Align the height and visual appearance of `Quantity`, `Location`, `Due Date`, and `Label Mode` in the Purchase confirmation grid across iOS and desktop.
- Ensure native `<select>` and `<input type="date">` controls render dark-theme native chrome via `color-scheme: dark`.

**Non-Goals:**
- Replacing native `<input type="date">` or `<select>` with custom JavaScript picker components (iOS native date and wheel pickers provide superior mobile ergonomics).
- Changing the Purchase form's 2-column mobile / 4-column desktop grid layout into a single-column stacked layout.

## Decisions

### 1. Global iOS `<input type="date">` normalization and `color-scheme: dark` in `web/src/index.css`
- **Choice**: In `@layer base` of `web/src/index.css`, add `:root { color-scheme: dark; }`, normalize `input[type="date"]` with `min-width: 0; max-width: 100%; -webkit-appearance: none; appearance: none;`, and set `input[type="date"]::-webkit-date-and-time-value { text-align: left; }`.
- **Rationale**: Fixes intrinsic-width overflow for all date inputs across the app (`ScannerDrawer.tsx` Purchase form, Inventory Audit reconciliation rows, and `ProductDetailPage.tsx` bulk due-date editor) and ensures native select chevrons and iOS picker sheets match the dark UI instead of rendering light-mode black-on-dark chrome. Keeping these rules inside `@layer base` preserves Tailwind utility overrides while leaving the unlayered `16px` iOS auto-zoom prevention rules intact.
- **Alternative considered**: Styling only the single `Due Date` input in `ScannerDrawer.tsx`. Rejected because other date inputs and native selects in the app share the same iOS WebKit behavior.

### 2. Constrain grid items and unify control heights in `ScannerDrawer.tsx` and `HierarchySelect.tsx`
- **Choice**:
  - Add `min-w-0` to every grid child (`<label>` and `<div>`) inside the `grid grid-cols-2 gap-3 sm:grid-cols-4` Purchase confirmation grid in `web/src/components/ScannerDrawer.tsx`.
  - Apply `block h-10 w-full min-w-0 max-w-full appearance-none rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-white` (and `h-10` with `min-w-0` on `Quantity` and `Label Mode`) so all controls share an exact `40px` (`h-10`) height that fits `16px` iOS text (`py-1.5` = `12px` vertical padding + `2px` border + `26px` content box) without clipping or collapsing when `Due Date` is empty.
  - Update the trigger `<button>` in `web/src/components/HierarchySelect.tsx` to use `h-10` (instead of relying solely on `py-2 text-sm`, which renders ~38px) so `Location` matches `Quantity`, `Due Date`, and `Label Mode` exactly.
- **Rationale**: `min-w-0` on grid cells allows CSS Grid tracks to shrink cleanly even when a child has long text or intrinsic width; uniform `h-10` prevents the empty `<input type="date">` from either collapsing or expanding taller than its neighbors on iOS.
- **Alternative considered**: Stacking `Due Date` and `Label Mode` into full-width single-column rows on mobile. Rejected because a compact 2×2 grid keeps the entire Purchase confirmation card visible without extra scrolling on iPhone screens once the date input is properly constrained.

## Risks / Trade-offs

- **[Risk] `appearance: none` on `<input type="date">` hides empty-state height on older iOS Safari versions** → **Mitigation**: Setting an explicit `h-10` (`2.5rem`) on the Purchase `Due Date` input and `display: flex; align-items: center` / explicit height ensures the box never collapses vertically even when `value=""`.
- **[Risk] Changing `HierarchySelect` trigger height from implicit `py-2` (~38px) to `h-10` (40px) slightly alters its height in other forms** → **Mitigation**: A 2px difference aligns `HierarchySelect` with standard Tailwind `h-10` inputs across the app (`ProductFormPage`, `ScannerDrawer`, `ProductDetailPage`) without affecting layout structure.

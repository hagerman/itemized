# Design

## Context

See `proposal.md` for motivation. In `web/src/pages/ProductDetailPage.tsx`, the bulk item actions bar uses `text-xs` compact styling, while `web/src/components/HierarchySelect.tsx` hardcodes `h-10` and `text-sm` on its trigger button for full-size form contexts (`ProductFormPage`, `ScannerDrawer`, `TaxonomyPages`). Meanwhile, the bulk bar's buttons rely on `py-1` (~24px) and its native `<input type="date">` and `<select>` rely on `py-1` + native chrome (~28–30px).

Additionally, `web/src/index.css` enforces `font-size: 16px` on `<input>` and `<select>` elements on iOS / coarse-pointer devices to prevent automatic zoom on focus, so the shared control height must comfortably accommodate 16px text without vertical clipping.

## Goals / Non-Goals

**Goals:**
- Give every interactive control in the Product detail bulk actions bar the exact same outer height (`h-8`, 32px) and consistent `rounded-lg` shape and vertical alignment.
- Preserve existing `h-10` (`2.5rem`) sizing on all other `HierarchySelect` instances in forms and modals.
- Keep native date/select inputs legible without clipping on both desktop (`text-xs`) and iOS/coarse-pointer devices (`16px`).

**Non-Goals:**
- Changing the layout, ordering, or API behavior of bulk item actions.
- Altering control heights on other pages (`ProductFormPage`, `ScannerDrawer`, `TaxonomyPages`).

## Decisions

1. **Standardize bulk bar control height at `h-8` (32px)**
   - *Rationale*: `h-8` sits cleanly between the current ~24px buttons and 40px `HierarchySelect`, keeping the bulk bar compact and proportional to the `Quick Add Item` button above it while providing 30px of inner height (after 1px top/bottom borders) so iOS `16px` `<input type="date">` and `<select>` text does not clip.
   - *Alternatives considered*:
     - `h-10` (40px): Would match `HierarchySelect`'s current height, but makes `Consume`/`Open`/`Reprint Labels` buttons look overly tall and bulky inside the compact `text-xs` toolbar.
     - `h-7` (28px): Too tight for `16px` iOS form inputs and native date-picker icons.

2. **Add an optional `size?: "default" | "sm"` prop to `HierarchySelect`**
   - *Rationale*: Keeps the component's sizing API explicit and reusable for any compact toolbar. `"default"` preserves `h-10 px-3 py-1.5 text-sm` (and `h-4 w-4` chevron) so existing form/modal call sites are untouched; `"sm"` applies `h-8 px-2.5 text-xs` (and `h-3.5 w-3.5` chevron).
   - *Alternatives considered*:
     - Adding a free-form `triggerClassName` prop: Risk of Tailwind class-ordering conflicts with the hardcoded `h-10` and `text-sm` classes unless a class-merging utility (`tailwind-merge`) is added.

3. **Explicit `inline-flex h-8 items-center` on buttons and `h-8` on native inputs**
   - *Rationale*: Removing `py-1` in favor of explicit `h-8` (with `inline-flex items-center` on buttons and `py-0` on `<input type="date">` and `<select>`) ensures identical border-box heights across `<button>`, `<input type="date">`, `<select>`, and `HierarchySelect` regardless of browser default line-height differences.

## Risks / Trade-offs

- [Native `<input type="date">` rendering differences across browsers] → Using `h-8` with `py-0` and `box-border` (Tailwind default) alongside existing `-webkit-appearance: none; appearance: none;` in `web/src/index.css` keeps height consistent across Chromium, Firefox, and WebKit/iOS Safari.
- [Touch target height on mobile] → `h-8` (32px) is taller than the previous ~24px bulk action buttons, improving mobile tap ergonomics without inflating the toolbar footprint.

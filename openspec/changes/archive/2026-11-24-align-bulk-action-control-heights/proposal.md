# Proposal

## Why

In the Product detail page's bulk item actions bar (`Items in Stock`), the controls render at noticeably mismatched heights: action buttons (`Consume`, `Open`, `Reprint Labels`, and conditional `Move`, `Set Due`, `Set Variant`) use compact padding (~24px), the native date input and variant `<select>` sit slightly taller (~28–30px), and the `Transfer to...` `HierarchySelect` trigger is hardcoded to `h-10` (40px). Aligning every control in this bar to a single uniform height makes the toolbar visually cohesive and easier to scan and interact with.

## What Changes

- Add an optional compact size variant (`size="sm"`) to `HierarchySelect` so compact toolbars can render its trigger at `h-8` (`2rem`) with `text-xs` typography without changing the default `h-10` (`2.5rem`) height used in full-size forms and modals.
- Standardize all interactive controls in the Product detail page bulk item actions bar—`Consume`, `Open`, `Reprint Labels`, `Transfer to...`, conditional `Move`, bulk due-date `<input type="date">`, conditional `Set Due`, bulk variant `<select>`, and conditional `Set Variant`—to a uniform `h-8` height with consistent vertical alignment and border radius (`rounded-lg`).
- Add frontend unit tests verifying `HierarchySelect` compact sizing and uniform height classes across all bulk action controls on `ProductDetailPage`.

## Capabilities

### New Capabilities

### Modified Capabilities
- `web-ui`: Require all interactive controls in the Product detail page's bulk item actions bar (buttons, location transfer selector, due-date input, and variant selector) to render at a uniform height.

## Impact

- `web/src/components/HierarchySelect.tsx`: Add optional `size?: "default" | "sm"` prop (defaulting to `"default"`).
- `web/src/pages/ProductDetailPage.tsx`: Apply consistent `h-8` sizing, flex centering, and `rounded-lg` styling to all controls in the bulk item actions bar, and pass `size="sm"` to the bulk transfer `HierarchySelect`.
- `web/src/components/HierarchySelect.test.tsx` & `web/src/pages/ProductDetailPage.test.tsx`: Add/update tests covering compact `HierarchySelect` rendering and uniform bulk action control heights.
- No backend, API, database, or dependency changes.

# Proposal

## Why

In the hierarchical drill-down selector's inline creation footer, the snowflake icon currently sits between the leading `+` icon and `Create Freezer "<name>"`, pushing `Create Freezer` to the right relative to the `Create "<name>"` button above it. Moving the snowflake icon after `Freezer` aligns both `Create` labels horizontally while keeping the freezer indicator visually clear.

## What Changes

- Move the snowflake icon in the inline freezer creation button from before `Create` to immediately after `Freezer` (between `Freezer` and `"<name>"`), so both `+ Create "<name>"` and `+ Create Freezer <snowflake> "<name>"` align on their leading `+` icon and `Create` text.
- Preserve the button's accessible name, truncation behavior, parent suffix (`in <parent>`), and inline creation/error behavior.
- Update the `hierarchy-navigation` spec and unit tests to specify and verify the snowflake icon placement after `Freezer`.

## Capabilities

### New Capabilities

### Modified Capabilities
- `hierarchy-navigation`: Require the inline freezer creation button to place the snowflake icon after `Freezer` (rather than between `+` and `Create`) so both inline `Create` labels align horizontally.

## Impact

- Frontend component: `web/src/components/HierarchySelect.tsx`
- Frontend tests: `web/src/components/HierarchySelect.test.tsx` (and existing `web/src/pages/ProductFormPage.test.tsx` coverage)
- No backend, API, or database changes.

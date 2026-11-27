# Proposal

## Why

In the location dropdown's inline creation footer, the standalone `Freezer` checkbox above `+ Create "<term>"` reads like a filter toggle for the search results rather than a modifier for the create action. Replacing it with two explicit create actions makes the intent unmistakable and removes an extra click when creating a freezer location.

## What Changes

- Remove the standalone `Freezer` checkbox from `HierarchySelect`'s inline creation footer.
- When `showFreezerOption` is enabled on an inline-create-enabled `HierarchySelect` (location pickers in Purchase and Product forms), render two explicit action buttons at the bottom of the dropdown:
  - `+ Create "<term>"` (or `+ Create "<term>" in <parent>` when drilled in) — creates the location with `is_freezer: false`.
  - `+ Create Freezer "<term>"` (with a snowflake icon, or `+ Create Freezer "<term>" in <parent>` when drilled in) — creates the location with `is_freezer: true`.
- Update `HierarchySelect` and `ProductFormPage` tests to verify the two-button create flow.

## Capabilities

### New Capabilities

<!-- None -->

### Modified Capabilities

- `hierarchy-navigation`: Replace the inline `Freezer` checkbox in the hierarchical drill-down selector's inline creation footer with two explicit buttons (`+ Create "<name>"` and `+ Create Freezer "<name>"`) when freezer creation is enabled.

## Impact

- **Frontend (`web/src/`)**:
  - `web/src/components/HierarchySelect.tsx`
  - `web/src/components/HierarchySelect.test.tsx`
  - `web/src/pages/ProductFormPage.test.tsx`
  - Rebuild embedded bundle (`make build`)

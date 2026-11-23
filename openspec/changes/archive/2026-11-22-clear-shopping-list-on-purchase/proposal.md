# Proposal

## Why

Products that are manually added to the shopping list currently remain on the shopping list even after they are purchased, forcing the user to manually toggle them off. Purchasing a product should automatically clear its manual shopping-list flag while still keeping the product on the shopping list if its stock remains below its configured `minimum_value`.

## What Changes

- Automatically clear `manually_added_to_shopping_list` (`0`) on a product whenever items are purchased/created for that product via `POST /api/workflows/purchase` or `POST /api/items`.
- Because `on_shopping_list` is derived from `manually_added_to_shopping_list || (minimum_value != nil && in_stock_count < minimum_value)`, clearing the manual flag removes the product from the shopping list unless its post-purchase stock is still below `minimum_value`.

## Capabilities

### New Capabilities
- `shopping-list-auto-clear`: Automatic clearing of a product's manual shopping-list flag upon purchasing items, while preserving low-stock shopping-list membership when stock remains below `minimum_value`.

### Modified Capabilities
<!-- None — `openspec/specs/` has no archived specs yet. -->

## Impact

- Backend handlers in `internal/api/workflows.go` (`handlePurchaseWorkflow`) and `internal/api/items.go` (`handleCreateItems`), plus API tests in `internal/api/api_test.go`.
- No database schema or frontend changes required (existing React Query invalidation already refreshes product and shopping-list state after purchase/item creation).

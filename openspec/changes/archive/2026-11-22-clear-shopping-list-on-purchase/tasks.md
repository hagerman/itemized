# Tasks

## 1. Clear Manual Shopping-List Flag on Purchase

- [x] 1.1 Update `handlePurchaseWorkflow` in `internal/api/workflows.go` and `handleCreateItems` in `internal/api/items.go` to clear `manually_added_to_shopping_list = 0` (and update `updated_at`) on the product within the item-creation transaction whenever items are purchased/created.
- [x] 1.2 Add API integration tests in `internal/api/api_test.go` covering all three scenarios: manually added product with no `minimum_value` leaves the shopping list on purchase, manually added product still below `minimum_value` clears the manual flag while remaining `on_shopping_list = true`, and manually added product reaching `minimum_value` leaves the shopping list (`go test -v ./internal/api/...`).

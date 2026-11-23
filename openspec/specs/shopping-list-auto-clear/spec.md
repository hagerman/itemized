# shopping-list-auto-clear Specification

## Purpose

Ensures that purchasing items for a product automatically clears its manual shopping-list flag while keeping the product on the shopping list whenever its current stock remains below its configured minimum quantity.

## Requirements

### Requirement: Clear manual shopping-list flag on purchase
When one or more items are purchased or added for a product (via `POST /api/workflows/purchase` or `POST /api/items`), the system SHALL clear `manually_added_to_shopping_list` (`false`) on that product within the same transaction.

#### Scenario: Manually added product without minimum quantity leaves shopping list on purchase
- **WHEN** a product has `manually_added_to_shopping_list = true` and `minimum_value = null`, and 1 item is purchased for that product
- **THEN** `manually_added_to_shopping_list` becomes `false` and `on_shopping_list` becomes `false`

#### Scenario: Manually added product with minimum quantity still unmet remains on shopping list
- **WHEN** a product has `manually_added_to_shopping_list = true`, `minimum_value = 3`, and 1 item in stock, and 1 additional item is purchased (bringing stock to 2)
- **THEN** `manually_added_to_shopping_list` becomes `false`
- **AND** `on_shopping_list` remains `true` because `in_stock_count (2) < minimum_value (3)`

#### Scenario: Manually added product meeting minimum quantity on purchase leaves shopping list
- **WHEN** a product has `manually_added_to_shopping_list = true`, `minimum_value = 3`, and 1 item in stock, and 2 items are purchased (bringing stock to 3)
- **THEN** `manually_added_to_shopping_list` becomes `false` and `on_shopping_list` becomes `false`

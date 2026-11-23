## MODIFIED Requirements

### Requirement: Shopping list and stock status filters
The system SHALL compute stock counts from unconsumed items (`consumed_on_date IS NULL`), determine each product's `next_due_on_date` and `next_location_name` from the unconsumed item with the soonest due date (treating unset due dates last and breaking ties by first entered), identify low-stock (`in_stock_count < minimum_value`), overdue, and due-soon products, and include a product on the shopping list when `manually_added_to_shopping_list` is true or it is low stock.

#### Scenario: Low-stock product appears on shopping list
- **WHEN** a product has `minimum_value = 2` and 1 unconsumed item
- **THEN** the product is included in the shopping list with a low-stock shortage of 1

#### Scenario: Next location reflects soonest-due unconsumed item
- **WHEN** a product's default location is `"Pantry"` and it has two unconsumed items: item A in `"Garage"` due `2026-12-20` and item B in `"Fridge"` due `2026-12-05`
- **THEN** the product's `next_location_name` is `"Fridge"`

#### Scenario: Tie-breaking when due dates are equal or unset
- **WHEN** a product has two unconsumed items with no due date (or the same due date), with item 1 entered first in `"Kitchen"` and item 2 entered later in `"Garage"`
- **THEN** the product's `next_location_name` is `"Kitchen"` (the first item entered)

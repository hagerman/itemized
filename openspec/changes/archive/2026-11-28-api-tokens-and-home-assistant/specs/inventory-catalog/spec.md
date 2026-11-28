# Spec Delta

## ADDED Requirements

### Requirement: Sensor-friendly inventory summary endpoint
The system SHALL provide `GET /api/summary` for authenticated clients returning compact counts (`in_stock_products`, `in_stock_items`, `all_products`, `due_soon`, `overdue`, `shopping_list`, `low_stock`) alongside lightweight arrays (`due_soon_products`, `overdue_products`, `shopping_list_products`) so integrations such as Home Assistant and iOS Shortcuts can populate multiple sensors from a single request.

#### Scenario: Fetching inventory summary with Bearer token
- **WHEN** an authenticated client (cookie or Personal API Token) requests `GET /api/summary`
- **THEN** the system returns HTTP 200 with `counts` (`in_stock_products`, `in_stock_items`, `all_products`, `due_soon`, `overdue`, `shopping_list`, `low_stock`) and arrays `due_soon_products`, `overdue_products`, and `shopping_list_products` containing each product's `id`, `name`, `in_stock_count`, `next_due_on_date`, `next_location_name`, `low_stock_amount`, and `manually_added_to_shopping_list`

#### Scenario: Unauthenticated summary request is rejected
- **WHEN** an unauthenticated client requests `GET /api/summary`
- **THEN** the system rejects the request with HTTP 401 Unauthorized

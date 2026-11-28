# Spec Delta

## ADDED Requirements

### Requirement: Quick consume next-due item for a product
The system SHALL provide `POST /api/products/{id}/consume-next` to consume the soonest-due unconsumed item for the specified product (using the existing FEFO order: soonest `due_on_date`, unset due dates last, ties broken by oldest `id`). The endpoint SHALL return HTTP 200 with `{ "item", "previous" }` for undo support, HTTP 404 when the product does not exist, and HTTP 409 when the product has no unconsumed items in stock.

#### Scenario: Consuming the soonest-due item of a product
- **WHEN** a product has unconsumed item A (due `2026-12-20`) and item B (due `2026-12-05`), and an authenticated user sends `POST /api/products/{id}/consume-next`
- **THEN** the system sets `consumed_on_date` on item B (leaving item A unconsumed) and returns HTTP 200 with the updated `item` and its unconsumed `previous` state

#### Scenario: Tie-breaking when due dates are unset or equal
- **WHEN** a product has two unconsumed items with unset due dates (item 1 created before item 2) and a client sends `POST /api/products/{id}/consume-next`
- **THEN** the system consumes item 1 (the earliest-entered item) and returns HTTP 200

#### Scenario: Consuming when product has no in-stock items
- **WHEN** a client sends `POST /api/products/{id}/consume-next` for an existing product with zero unconsumed items
- **THEN** the system responds with HTTP 409 Conflict without modifying any records

#### Scenario: Consuming a non-existent product
- **WHEN** a client sends `POST /api/products/{id}/consume-next` for a product ID that does not exist
- **THEN** the system responds with HTTP 404 Not Found

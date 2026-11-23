## MODIFIED Requirements

### Requirement: Label print mode enforcement
When items are created in Purchase mode, the system SHALL respect `label_print_mode` (`none`, `single`, or `per_item`), encoding `<base_url>/go/{i,p,l}/<id>` in QR payloads. For products configured with `label_print_mode = "per_item"`, whenever opening or transferring an item (single, bulk, or Inventory Audit) changes its `due_on_date`, the system SHALL automatically print a new `item` label reflecting the updated due date.

#### Scenario: Per-item batch print
- **WHEN** 3 items are purchased with `label_print_mode=per_item` and an active printer is configured
- **THEN** the server sends 3 `item` label jobs, each encoding its own integer item ID in `/go/i/<id>`

#### Scenario: Auto-reprint on Open when due date changes
- **WHEN** an item belonging to a `per_item` product is opened and `default_due_days_on_open` shortens its `due_on_date`
- **THEN** the server automatically prints a new `item` label with the updated due date

#### Scenario: Auto-reprint on Freeze or Thaw transfer when due date changes
- **WHEN** an item belonging to a `per_item` product is transferred into or out of a freezer location and its `due_on_date` changes
- **THEN** the server automatically prints a new `item` label with the updated due date

#### Scenario: No reprint when due date is unchanged or mode is not per_item
- **WHEN** an item is opened or transferred without changing its `due_on_date`, or its product uses `label_print_mode` `single` or `none`
- **THEN** no item label print job is triggered

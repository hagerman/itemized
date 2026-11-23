# label-printing Specification

## Purpose

Embeds direct LAN label printing into the server with pluggable printer protocols and built-in ZPL templates that can be customized from the web interface.

## Requirements

### Requirement: Direct LAN printer management and pluggable drivers
The system SHALL allow household users to configure shared `Printer` records specifying a name, enabled status, driver protocol (`ipp_zpl` or `raw_tcp_zpl`), and network endpoint (IPP URL such as `http://<ip>:631/ipp/print` or host/port such as `<ip>:9100`), and SHALL send rendered ZPL directly from the server without a companion desktop app.

#### Scenario: Printing via IPP ZPL (Zebra ZSB)
- **WHEN** a print is triggered for an enabled `ipp_zpl` printer
- **THEN** the server queries `media-ready` via IPP (falling back gracefully if unavailable), renders the ZPL template, and submits an IPP `Print-Job` request with `application/vnd.zebra-zpl`

#### Scenario: Printing via Raw TCP 9100
- **WHEN** a print is triggered for an enabled `raw_tcp_zpl` printer
- **THEN** the server renders the ZPL template and writes the ZPL bytes directly to the configured TCP socket

#### Scenario: Printer connectivity test
- **WHEN** a user triggers a test print or connection check on a printer in Settings
- **THEN** the system reports success or a clear network/printer error message

### Requirement: Built-in ZPL templates with UI overrides
The system SHALL ship embedded default ZPL templates for `item`, `product`, and `location` labels, and SHALL allow users to view, edit, preview template variables, and reset custom overrides per entity type in the Web UI (persisted in `LabelTemplate`).

#### Scenario: Custom template overrides embedded default
- **WHEN** a user saves a custom ZPL template for `item` labels in Settings
- **THEN** subsequent item label prints render the custom template instead of the embedded default

#### Scenario: Resetting a template restores default
- **WHEN** a user resets a customized template
- **THEN** the system removes or clears the override and reverts to the embedded default template

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

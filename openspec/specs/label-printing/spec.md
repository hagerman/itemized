# label-printing Specification

## Purpose

Embeds direct LAN label printing into the server with pluggable printer protocols and built-in ZPL templates that can be customized from the web interface.

## Requirements

### Requirement: Direct LAN printer management and pluggable drivers
The system SHALL allow authenticated administrators to configure, list, test, and delete shared `Printer` records specifying a name, enabled status, driver protocol (`ipp_zpl` or `raw_tcp_zpl`), and network endpoint (IPP URL such as `http://<ip>:631/ipp/print` or host/port such as `<ip>:9100`), and SHALL send rendered ZPL directly from the server without a companion desktop app. Non-admin `member` users SHALL still trigger normal label prints during inventory workflows, while printer administration endpoints (`/api/printers*`) SHALL reject non-admin users with HTTP 403.

#### Scenario: Printing via IPP ZPL (Zebra ZSB)
- **WHEN** a print is triggered for an enabled `ipp_zpl` printer
- **THEN** the server queries `media-ready` via IPP (falling back gracefully if unavailable), renders the ZPL template, and submits an IPP `Print-Job` request with `application/vnd.zebra-zpl`

#### Scenario: Printing via Raw TCP 9100
- **WHEN** a print is triggered for an enabled `raw_tcp_zpl` printer
- **THEN** the server renders the ZPL template and writes the ZPL bytes directly to the configured TCP socket

#### Scenario: Printer connectivity test
- **WHEN** an administrator triggers a test print or connection check on a printer in Settings
- **THEN** the system reports success or a sanitized printer error message

#### Scenario: Non-admin attempts to manage printers
- **WHEN** an authenticated `member` requests `GET/POST /api/printers`, `PATCH/DELETE /api/printers/{id}`, or `POST /api/printers/{id}/test`
- **THEN** the system rejects the request with HTTP 403 Forbidden

### Requirement: Built-in ZPL templates with UI overrides
The system SHALL ship embedded default ZPL templates for `item`, `product`, and `location` labels, and SHALL allow authenticated administrators to view, edit, preview template variables, and reset custom overrides per entity type in the Web UI (persisted in `LabelTemplate`). Non-admin requests to `/api/label-templates*` SHALL be rejected with HTTP 403.

#### Scenario: Custom template overrides embedded default
- **WHEN** an administrator saves a custom ZPL template for `item` labels in Settings
- **THEN** subsequent item label prints render the custom template instead of the embedded default

#### Scenario: Resetting a template restores default
- **WHEN** an administrator resets a customized template
- **THEN** the system removes or clears the override and reverts to the embedded default template

#### Scenario: Non-admin attempts to manage label templates
- **WHEN** an authenticated `member` requests `GET /api/label-templates` or `PUT/DELETE /api/label-templates/{entityType}`
- **THEN** the system rejects the request with HTTP 403 Forbidden

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

### Requirement: Raw TCP printer endpoint normalization and guidance
For `raw_tcp_zpl` printers, the system SHALL normalize endpoints into canonical `host:port` form (defaulting port to `9100`, stripping URL schemes and paths) on create/update and before dialing, and SHALL reject invalid endpoints with HTTP 422 on create/update. The Settings printer form SHALL show a driver-appropriate endpoint placeholder and display creation errors.

#### Scenario: Raw TCP printer with URL-formatted endpoint
- **WHEN** a `raw_tcp_zpl` printer is saved or printed with an endpoint containing a URL scheme such as `http://192.168.1.102:9100`, `tcp://192.168.1.102:9100`, or `http://192.168.1.102`
- **THEN** the system strips the scheme and any path, defaults the port to `9100` when omitted, stores the normalized `host:port` on create/update, and dials `192.168.1.102:9100` without a `too many colons in address` error

#### Scenario: Raw TCP printer with bare host or IPv6 address
- **WHEN** a `raw_tcp_zpl` printer is saved or printed with a bare hostname, IPv4 address, or IPv6 literal (e.g., `192.168.1.102`, `::1`, `[::1]`, or `[::1]:9100`)
- **THEN** the system resolves it to canonical `host:port` form (e.g., `192.168.1.102:9100`, `[::1]:9100`)

#### Scenario: Rejecting invalid Raw TCP printer endpoint
- **WHEN** an administrator submits `POST /api/printers` or `PATCH /api/printers/{id}` for `raw_tcp_zpl` with an unparseable endpoint, missing host, or out-of-range port (e.g., `http://`, `192.168.1.102:99999`, or `192.168.1.102:abc`)
- **THEN** the server rejects the request with HTTP 422 Unprocessable Entity and does not persist the invalid endpoint

#### Scenario: Driver-aware endpoint placeholder in Settings
- **WHEN** an administrator selects `Raw TCP :9100 ZPL` in the Settings printer form
- **THEN** the endpoint input placeholder updates to a `host:port` example (e.g., `192.168.1.50:9100`) instead of an IPP URL, and any validation error returned when adding a printer is displayed in the UI

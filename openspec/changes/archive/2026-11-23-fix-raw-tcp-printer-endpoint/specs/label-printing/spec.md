# Spec Delta

## ADDED Requirements

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

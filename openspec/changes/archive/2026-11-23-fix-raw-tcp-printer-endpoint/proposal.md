# Proposal

## Why

Testing or printing to a `raw_tcp_zpl` (:9100) printer fails with `dial tcp: address http://192.168.1.102:9100: too many colons in address` when the endpoint includes a URL scheme such as `http://`. The Settings UI currently shows an IPP URL placeholder (`http://192.168.1.50:631/ipp/print`) even when `Raw TCP :9100 ZPL` is selected, and `RawTCPDriver` passes the raw endpoint string directly to `net.Dialer.DialContext` after only checking `!strings.Contains(addr, ":")`.

## What Changes

- Normalize `raw_tcp_zpl` printer endpoints in `internal/printer` so URL-formatted endpoints (e.g., `http://192.168.1.102:9100`, `tcp://192.168.1.102:9100`, `socket://192.168.1.102:9100`, `http://192.168.1.102`), bare host/IPs (`192.168.1.102`), and IPv6 addresses (`[::1]`, `[::1]:9100`, `::1`) resolve cleanly to `host:port` (defaulting port to `9100`), allowing existing saved printers with URL-prefixed endpoints to work immediately.
- Normalize and validate `raw_tcp_zpl` endpoints in `POST /api/printers` and `PATCH /api/printers/{id}`, storing the canonical `host:port` form and rejecting invalid or empty-host endpoints with HTTP 422.
- Update the Settings UI printer creation form to show a driver-appropriate endpoint placeholder (`192.168.1.50:9100` for `raw_tcp_zpl`, `http://192.168.1.50:631/ipp/print` for `ipp_zpl`) and surface API errors if printer creation fails.

## Capabilities

### New Capabilities
- *(none)*

### Modified Capabilities
- `label-printing`: Add raw TCP `:9100` endpoint normalization, validation on printer create/update, and driver-appropriate endpoint placeholder guidance in Settings.

## Impact

- `internal/printer/printer.go` and `internal/printer/printer_test.go`: New exported raw TCP endpoint normalization helper used by `RawTCPDriver.Print` and API handlers, plus unit tests covering IPv4, hostnames, IPv6, URL schemes, trailing paths, default port `9100`, and invalid inputs.
- `internal/api/workflows.go` and `internal/api/api_test.go`: Normalize/validate `raw_tcp_zpl` endpoints in `handleCreatePrinter` and `handleUpdatePrinter`, with API tests.
- `web/src/pages/SettingsPage.tsx`: Dynamic endpoint placeholder based on selected driver and error handling on printer creation submit.

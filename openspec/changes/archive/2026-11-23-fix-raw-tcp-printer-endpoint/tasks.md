# Tasks

## 1. Raw TCP Endpoint Normalization (`internal/printer`)

- [x] 1.1 Implement `NormalizeRawTCPEndpoint(endpoint string) (string, error)` in `internal/printer/printer.go` to strip URL schemes/paths (`http://`, `https://`, `tcp://`, `socket://`), default missing ports to `9100`, handle IPv4/hostnames/IPv6, and validate host presence and numeric port bounds (`1..65535`), and update `RawTCPDriver.Print` to call it before dialing; verify with `go test ./internal/printer/...`.
- [x] 1.2 Add table-driven unit tests in `internal/printer/printer_test.go` covering `NormalizeRawTCPEndpoint` and `RawTCPDriver.Print` with `http://192.168.1.102:9100`, `http://192.168.1.102`, `tcp://192.168.1.102:9100`, `socket://192.168.1.102:9100/`, bare IP/hostname, IPv6 (`::1`, `[::1]`, `[::1]:9100`), and invalid inputs (empty, `http://`, out-of-range or non-numeric port, malformed colons); verify `go test -v ./internal/printer/...` passes.

## 2. Printer API Validation and Normalization (`internal/api`)

- [x] 2.1 Update `handleCreatePrinter` and `handleUpdatePrinter` in `internal/api/workflows.go` to normalize `req.Endpoint` via `printer.NormalizeRawTCPEndpoint` when `req.Driver == printer.DriverRawTCPZPL`, returning HTTP 422 on invalid endpoints and persisting the canonical `host:port`; verify with `go test ./internal/api/...`.
- [x] 2.2 Add API tests in `internal/api/api_test.go` verifying that `POST /api/printers` and `PATCH /api/printers/{id}` normalize `http://192.168.1.102:9100` to `192.168.1.102:9100`, reject invalid `raw_tcp_zpl` endpoints with HTTP 422, and that `POST /api/printers/{id}/test` succeeds when an existing DB row holds `http://127.0.0.1:<port>`; verify `go test -v ./internal/api/...` passes.

## 3. Settings UI Placeholder and Error Handling (`web`)

- [x] 3.1 Update `web/src/pages/SettingsPage.tsx` so the printer endpoint input placeholder switches dynamically between `http://192.168.1.50:631/ipp/print` (`ipp_zpl`) and `192.168.1.50:9100` (`raw_tcp_zpl`), and wrap the `POST /api/printers` submit handler in `try/catch` to surface validation errors in the error banner; verify with `npm run build` (and `npm test` if applicable) in `web/`.

## 4. End-to-End Verification

- [x] 4.1 Run `go test ./...`, `go vet ./...`, and `gopls check` on modified/all Go files (resolving `gopls` from `PATH` or `$(go env GOPATH)/bin/gopls`), plus `cd web && npm run build`, and confirm zero errors or diagnostics.

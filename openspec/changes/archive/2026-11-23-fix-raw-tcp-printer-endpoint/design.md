# Design

## Context

See `proposal.md` for motivation. Currently:
- `internal/printer/printer.go` (`RawTCPDriver.Print`) only checks `!strings.Contains(addr, ":")` before appending `:9100` and passing `addr` directly to `net.Dialer.DialContext("tcp", addr)`. Any URL scheme (`http://192.168.1.102:9100`) or bare IPv6 address contains `:` and fails to dial (`too many colons in address`).
- `internal/api/workflows.go` (`handleCreatePrinter`, `handleUpdatePrinter`) trims whitespace and validates driver name, but performs no endpoint normalization or validation.
- `web/src/pages/SettingsPage.tsx` hardcodes `placeholder="http://192.168.1.50:631/ipp/print"` on the endpoint `<input>` regardless of selected driver, and its `onSubmit` handler does not catch errors from `POST /api/printers`.

## Goals / Non-Goals

**Goals:**
- Provide a single, well-tested `NormalizeRawTCPEndpoint(endpoint string) (string, error)` function in `internal/printer` that converts valid raw TCP endpoint inputs into canonical `host:port` form (default port `9100`).
- Ensure already-persisted `raw_tcp_zpl` printer records containing `http://...` work immediately on test print and label print without requiring manual recreation or a database migration.
- Normalize and validate `raw_tcp_zpl` endpoints on `POST /api/printers` and `PATCH /api/printers/{id}`.
- Guide administrators in Settings with a driver-specific endpoint placeholder and display API errors on printer creation.

**Non-Goals:**
- Adding a SQLite data migration to rewrite existing `printers.endpoint` rows (dial-time normalization makes them work immediately with zero migration risk).
- Changing `ipp_zpl` endpoint validation or driver behavior.

## Decisions

### 1. Shared `NormalizeRawTCPEndpoint` helper in `internal/printer`
Add `NormalizeRawTCPEndpoint(endpoint string) (string, error)` to `internal/printer/printer.go`:
1. Trim whitespace; return error if empty.
2. If the string contains `"://"`, parse with `net/url.Parse`:
   - Extract `host := u.Hostname()` and `port := u.Port()`.
   - Reject if `host == ""` (e.g., `http://` or `http://:9100`).
   - If `port == ""`, default to `"9100"`.
3. Otherwise (no scheme):
   - Strip any trailing slash/path component (`hostPort, _, _ := strings.Cut(raw, "/")`) so inputs like `192.168.1.102:9100/` also normalize cleanly.
   - Attempt `net.SplitHostPort(hostPort)`:
     - On success: require `host != ""`; if `port == ""`, default to `"9100"`.
     - On error: check if `hostPort` is a bare IPv6 literal (`net.ParseIP(strings.Trim(hostPort, "[]")) != nil`) or a bare hostname/IPv4 without `:` (and not containing whitespace). If it contains `:` and is not a valid IPv6 literal, return an error. Otherwise set `host = strings.Trim(hostPort, "[]")` and `port = "9100"`.
4. Validate `port` parses as an integer in `[1, 65535]`.
5. Validate `host` contains no whitespace and return `net.JoinHostPort(host, port)`.

**Alternatives considered:**
- *Rejecting URL schemes instead of normalizing*: Would break existing saved printers and frustrate users who copy-paste URLs from printer status pages or router tables.
- *Simple `strings.TrimPrefix("http://")`*: Misses `https://`, `tcp://`, `socket://`, trailing slashes/paths, bare IPv6, and invalid port numbers.

### 2. Normalize at both API write boundaries and `RawTCPDriver.Print`
- `handleCreatePrinter` and `handleUpdatePrinter` call `printer.NormalizeRawTCPEndpoint(req.Endpoint)` when `req.Driver == printer.DriverRawTCPZPL`. On error, respond `422 Unprocessable Entity` with a clear message (e.g., `"invalid raw tcp endpoint"`). On success, store the normalized `host:port`.
- `RawTCPDriver.Print` also calls `NormalizeRawTCPEndpoint(endpoint)` before dialing, returning an error if invalid.

**Rationale:** Write-time normalization keeps new database records clean and catches typos immediately; dial-time normalization guarantees existing database rows (e.g., `http://192.168.1.102:9100`) and direct driver invocations work reliably.

### 3. Driver-aware placeholder and error handling in `SettingsPage.tsx`
- Compute placeholder from `pDriver`:
  - `raw_tcp_zpl`: `"192.168.1.50:9100"`
  - `ipp_zpl`: `"http://192.168.1.50:631/ipp/print"`
- Wrap the `Add Printer` `onSubmit` `apiFetch` call in `try { ... } catch (err) { setError(...) }`, matching the pattern already used by `saveAccount`, `saveInstanceSettings`, and `Add User`.

## Risks / Trade-offs

- **Existing DB rows retain their displayed string until edited/recreated**: A previously saved `raw_tcp_zpl` printer with `http://192.168.1.102:9100` will continue showing `http://192.168.1.102:9100` in the Settings list even though test/print succeeds → Acceptable low-risk trade-off compared to mutating user data via a migration; users can recreate or update it if they want the display updated.
- **Port validation strictness**: Validating port `1..65535` rejects named service ports (e.g. `host:jetdirect`) → Label printers use numeric ports (`9100`), and numeric validation avoids silent misconfigurations.

# Tasks

## 1. Documentation

- [x] 1.1 Add an HTTPS / Reverse Proxy section to `README.md` explaining that mobile and iOS live barcode scanning requires HTTPS (`https://`) via a reverse proxy (e.g., Nginx Proxy Manager, Caddy, Traefik, or Tailscale Serve) and recommending `TRUST_PROXY=true` and `BASE_URL=https://...`; verify the section renders cleanly and matches the environment variables table

## 2. Scanner HTTPS Error & iOS Camera Selection

- [x] 2.1 Update `web/src/components/BarcodeScanner.tsx` so that when `navigator.mediaDevices?.getUserMedia` is unavailable and `window.isSecureContext === false`, it displays an actionable HTTPS / reverse-proxy error message while keeping `"Camera API unavailable in this browser."` for secure contexts lacking camera APIs; verify with unit tests in `web/src/components/Scanner.test.tsx` covering both `isSecureContext = false` and `isSecureContext = true`
- [x] 2.2 Update `web/src/components/BarcodeScanner.tsx` to request `{ video: { facingMode: "environment" } }` by default when no lens has been explicitly selected, and refresh `navigator.mediaDevices.enumerateDevices()` after `getUserMedia()` succeeds so the lens switcher populates and cycles cameras accurately on iOS Safari; verify with unit tests in `web/src/components/Scanner.test.tsx` asserting the default `facingMode: "environment"` constraint and post-permission device enumeration

## 3. Verification

- [x] 3.1 Run frontend tests and production build (`cd web && npm test && npm run build`) and verify all tests pass and TypeScript/Vite build succeeds with no errors
- [x] 3.2 Run `go test ./...`, `go vet ./...`, and `gopls check` on Go files (resolving `gopls` from `PATH` or `$(go env GOPATH)/bin/gopls`) and verify all checks pass with zero diagnostics

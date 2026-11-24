# Proposal

## Why

When accessing Itemized from iOS Safari over plain HTTP on a LAN IP (such as the default Unraid `http://[IP]:8080/` URL), WebKit disables `navigator.mediaDevices` in insecure contexts and the barcode scanner fails with a generic `"Camera API unavailable in this browser."` error. Users need clear documentation explaining that mobile live camera scanning requires serving Itemized behind an HTTPS reverse proxy, an actionable in-app error message when opened over insecure HTTP, and a fix for iOS rear-camera selection and lens enumeration once accessed over HTTPS.

## What Changes

- **Documentation (`README.md`)**: Add a clear HTTPS / Reverse Proxy section explaining that mobile and iOS live barcode scanning requires a secure (`https://`) origin via a reverse proxy (e.g., Nginx Proxy Manager, Caddy, Traefik, or Tailscale Serve), and cross-reference the related `TRUST_PROXY=true` and `BASE_URL=https://...` settings.
- **Actionable insecure-context camera error (`web/src/components/BarcodeScanner.tsx`)**: Detect `!window.isSecureContext` when `navigator.mediaDevices?.getUserMedia` is unavailable and display a clear message explaining that live camera scanning requires HTTPS (e.g., via a reverse proxy), while keeping the generic browser-unsupported message for secure contexts lacking camera APIs.
- **iOS camera selection & enumeration fix (`web/src/components/BarcodeScanner.tsx`)**: Request the rear camera (`{ facingMode: "environment" }`) by default rather than selecting `videoInputs[0]` (which can pick the front camera on iOS), and enumerate video input devices after `getUserMedia` grants permission so the lens switcher populates accurately on iOS Safari.

## Capabilities

### New Capabilities

### Modified Capabilities
- `barcode-scanning`: Clarify scanner behavior in insecure HTTP contexts (actionable HTTPS error message) and default rear-camera selection with post-permission device enumeration on mobile/iOS browsers.

## Impact

- `README.md`: New reverse proxy / HTTPS requirement documentation for mobile barcode scanning.
- `web/src/components/BarcodeScanner.tsx`: Insecure-context detection, rear-camera default constraint, and post-permission `enumerateDevices()` refresh.
- `web/src/components/Scanner.test.tsx`: Unit tests covering insecure-context error messaging, genuinely unavailable camera API messaging, and rear-camera default + post-permission device enumeration.
- No backend API, database schema, or container entrypoint changes.

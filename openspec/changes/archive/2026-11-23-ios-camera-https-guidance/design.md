# Design

## Context

See `proposal.md` for motivation. Currently, `web/src/components/BarcodeScanner.tsx` has two iOS-facing issues:

1. When opened over plain HTTP on a LAN IP (e.g., `http://192.168.1.21:8080`), iOS Safari/WebKit omits `navigator.mediaDevices` because `window.isSecureContext` is `false`. The component only checks `!navigator.mediaDevices?.getUserMedia` and shows `"Camera API unavailable in this browser."`, giving no hint that HTTPS via a reverse proxy resolves the issue.
2. When opened over HTTPS on iOS, `startCamera()` calls `enumerateDevices()` *before* `getUserMedia()` and selects `videoInputs[deviceIndex]` whenever `chosen?.deviceId` is non-empty. Before permission is granted, iOS returns empty `deviceId`s and `devices` is never refreshed afterward; once permission is granted, `videoInputs[0]` can resolve to the front-facing camera instead of the rear camera.

Meanwhile, `README.md` documents `TRUST_PROXY` and `BASE_URL` in the environment variable table, but does not explain that mobile/iOS browsers require HTTPS for live barcode scanning.

## Goals / Non-Goals

**Goals:**
- Document the HTTPS reverse-proxy requirement clearly in `README.md` (with concrete reverse proxy examples and the relevant `TRUST_PROXY` / `BASE_URL` environment variables).
- Distinguish insecure HTTP contexts from unsupported browsers in `BarcodeScanner.tsx` with a clear HTTPS error message.
- Ensure `BarcodeScanner.tsx` requests `{ facingMode: "environment" }` by default on initial camera start and refreshes `enumerateDevices()` after `getUserMedia()` succeeds so the lens switcher works on iOS Safari.

**Non-Goals:**
- Adding built-in TLS termination or self-signed certificate generation to the Go binary.
- Adding a photo-upload / still-image capture fallback over plain HTTP.
- Changing backend API endpoints, database schema, or Unraid container port mappings.

## Decisions

1. **Reverse-proxy HTTPS documentation over built-in TLS**
   - **Decision**: Keep Itemized as a single HTTP container behind the user's reverse proxy and document this clearly in `README.md`.
   - **Rationale**: Most homelab and Unraid deployments already terminate TLS via Nginx Proxy Manager, Caddy, Traefik, Swag, or Tailscale Serve, avoiding self-signed certificate trust friction on iOS devices.
   - **Alternatives considered**: Built-in self-signed TLS in Go (requires manual iOS CA profile trust for smooth PWA/Safari usage) or `<input type="file" capture="environment">` photo fallback (out of scope per user preference).

2. **Explicit `window.isSecureContext` check in `BarcodeScanner.tsx`**
   - **Decision**: When `!navigator.mediaDevices?.getUserMedia`, check `window.isSecureContext === false` first and show: `"Camera requires HTTPS. Access Itemized over HTTPS (e.g., via a reverse proxy) to use live barcode scanning."` Otherwise fall back to `"Camera API unavailable in this browser."`
   - **Rationale**: `window.isSecureContext` is standard across iOS Safari, Chrome, and Firefox (and `true` on `https://` and `http://localhost`). Checking `=== false` safely preserves the existing fallback if `isSecureContext` is undefined in older/test environments.

3. **Explicit `selectedDeviceId` (or nullable `deviceIndex`) + post-permission `enumerateDevices()`**
   - **Decision**: Track whether the user has explicitly selected a specific camera lens (e.g., `deviceIndex: number | null` initialized to `null`, or `selectedDeviceId: string | null`). When `null`, request `{ video: { facingMode: "environment" } }`. After `getUserMedia()` succeeds, call `navigator.mediaDevices.enumerateDevices()` to populate `devices` (filtering `kind === "videoinput"`), and match the active track's `getSettings().deviceId` when cycling lenses so tapping "Switch camera" moves to the next distinct lens rather than re-selecting the active one.
   - **Rationale**: Fixes both the pre-permission empty-device-list bug and the front-camera-first bug on iOS Safari while keeping the existing lens-switcher UI unchanged.

## Risks / Trade-offs

- **Reverse proxy misconfiguration** → Documenting `TRUST_PROXY=true` and `BASE_URL=https://...` alongside reverse proxy examples prevents rate-limiting and QR-label URL mismatches.
- **jsdom test environment `window.isSecureContext`** → In Vitest/jsdom, `window.isSecureContext` may be `false` or `undefined` depending on test setup; unit tests should explicitly stub `window.isSecureContext` (`true` and `false`) to verify both error branches deterministically.

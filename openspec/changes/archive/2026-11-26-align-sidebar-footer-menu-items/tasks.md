# Tasks

## 1. Align Sidebar Footer Menu Items

- [x] 1.1 Update the sidebar footer in `web/src/components/Layout.tsx` so the `Help` link (`/help`) and account/settings link (`/settings`) share identical horizontal/vertical padding (`px-2 py-1.5`), rounded surface treatment (`rounded-lg`), icon sizing (`shrink-0`), icon-to-label gap (`gap-2`), consistent row spacing (`space-y-1`), and active/hover states while preserving `min-w-0 flex-1` truncation on the email link, the right-aligned `Logout` button (hidden in `demoMode`), and mobile bottom safe-area inset padding (`pb-[calc(0.75rem+env(safe-area-inset-bottom))]`). Verify visually and via `cd web && npm run build`.
- [x] 1.2 Add unit tests in `web/src/components/Layout.test.tsx` asserting that the sidebar footer `Help` and settings (`user.email`) links share matching alignment classes (`px-2`, `py-1.5`, `rounded-lg`, `gap-2`), fixed-size icons (`shrink-0`), active highlight state on `/help` and `/settings`, and preserved `Logout` button and bottom safe-area inset padding. Verify with `cd web && npm test`.

## 2. Project Verification

- [x] 2.1 Run full frontend and backend verification: `cd web && npm test && npm run build`, `go test ./...`, `go vet ./...`, and `gopls check` on Go files, confirming zero failures or diagnostics.

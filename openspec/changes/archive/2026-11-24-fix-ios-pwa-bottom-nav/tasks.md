# Tasks

## 1. Mobile Bottom Dock & Drawer Safe-Area Fix

- [x] 1.1 Update the mobile bottom dock in `web/src/components/Layout.tsx` from `h-16` to `h-[calc(4rem+env(safe-area-inset-bottom))]` (preserving `pb-[env(safe-area-inset-bottom)]`), change its wrapper element to `<nav aria-label="Mobile navigation">`, and add `pb-[calc(0.75rem+env(safe-area-inset-bottom))] lg:pb-3` to the sidebar footer; verify the updated classes and landmark in `web/src/components/Layout.test.tsx` via `cd web && npm test`.
- [x] 1.2 Add unit test assertions in `web/src/components/Layout.test.tsx` confirming the `Mobile navigation` landmark includes `h-[calc(4rem+env(safe-area-inset-bottom))]` and `pb-[env(safe-area-inset-bottom)]` (and does not use fixed `h-16`), and that the sidebar footer includes `pb-[calc(0.75rem+env(safe-area-inset-bottom))]`; verify `cd web && npm test` passes.

## 2. Build & Verification

- [x] 2.1 Rebuild the embedded frontend bundle with `cd web && npm run build` and verify the build succeeds cleanly with updated assets in `web/dist/`.
- [x] 2.2 Run `go test ./...`, `go vet ./...`, and `gopls check` on Go files (resolving `gopls` from `PATH` or `$(go env GOPATH)/bin/gopls`) and verify all checks pass with zero diagnostics.

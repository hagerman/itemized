# Tasks

## 1. Fix localStorage mocking in Scanner.test.tsx

- [x] 1.1 Update the unavailable-storage assertions in `web/src/components/Scanner.test.tsx` to replace `window.localStorage` via `Object.defineProperty(window, "localStorage", ...)` (restoring the original property descriptor in a `finally` block) with a mock whose `getItem` throws `SecurityError` and `setItem` throws `QuotaExceededError`, plus a case where accessing `window.localStorage` getter itself throws `SecurityError`; verify `cd web && npm test` and `cd web && npm run build` pass.

## 2. Verification

- [x] 2.1 Verify the test passes against jsdom's native `Storage` Proxy (as on CI Node 22) as well as the local Node 25+ fallback, and run `go test ./...`, `go vet ./...`, and `gopls check` on Go files to confirm the full repo remains clean.

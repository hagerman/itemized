# Tasks

## 1. iOS PWA Status Bar Style

- [x] 1.1 Update `<meta name="apple-mobile-web-app-status-bar-style">` in `web/index.html` from `"black-translucent"` to `"default"`, update `web/src/pwa.test.ts` to assert `"default"`, and verify with `npm --prefix web test -- --run src/pwa.test.ts`

## 2. Verification

- [x] 2.1 Run frontend test suite and production build (`npm --prefix web test -- --run && npm --prefix web run build`) and confirm all tests and the build pass
- [x] 2.2 Run Go verification (`go test ./...`, `go vet ./...`, and `gopls check` on Go files) and confirm zero errors or diagnostics

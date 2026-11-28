# Tasks

## 1. Document Root Status-Bar Background

- [x] 1.1 Set `background-color: #ffffff` on `:root` and `background-color: #0f172a` on `:root.dark` in `web/src/index.css`, update `<body>` in `web/index.html` from `bg-slate-50 dark:bg-slate-950` to `bg-white dark:bg-slate-900`, add unit test assertions in `web/src/pwa.test.ts`, and verify with `npm --prefix web test -- --run src/pwa.test.ts`

## 2. Verification

- [x] 2.1 Run frontend test suite and production build (`npm --prefix web test -- --run && npm --prefix web run build`) and confirm all tests and the build pass
- [x] 2.2 Run Go verification (`go test ./...`, `go vet ./...`, and `gopls check` on Go files) and confirm zero errors or diagnostics

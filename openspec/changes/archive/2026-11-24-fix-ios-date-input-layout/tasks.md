# Tasks

## 1. Global iOS Date Input & Dark Color-Scheme CSS

- [x] 1.1 Update `@layer base` in `web/src/index.css` to declare `:root { color-scheme: dark; }`, normalize `input[type="date"]` (`min-width: 0; max-width: 100%; -webkit-appearance: none; appearance: none;`), and left-align `input[type="date"]::-webkit-date-and-time-value`, while preserving the unlayered `16px` iOS auto-zoom prevention rules; add unit test assertions in `web/src/pwa.test.ts` verifying these rules and confirm `cd web && npm test` passes.

## 2. Scan & Action Purchase Grid & Control Height Alignment

- [x] 2.1 Update the Purchase confirmation grid (`grid grid-cols-2 gap-3 sm:grid-cols-4`) in `web/src/components/ScannerDrawer.tsx` to add `min-w-0` to every grid cell (`Quantity`, `Location`, `Due Date`, `Label Mode`) and apply `h-10 w-full min-w-0 max-w-full` (plus `block appearance-none` on `Due Date` and `py-1.5` for clean `16px` iOS text fit) across the inputs/select, and align the trigger `<button>` height in `web/src/components/HierarchySelect.tsx` to `h-10`; add unit test assertions in `web/src/components/Scanner.test.tsx` confirming the grid cells include `min-w-0` and `Due Date` includes `min-w-0`, `max-w-full`, `appearance-none`, and `h-10`, and confirm `cd web && npm test` passes.

## 3. Build & Verification

- [x] 3.1 Rebuild the embedded frontend bundle with `cd web && npm run build` and verify the build succeeds cleanly with updated assets in `web/dist/`.
- [x] 3.2 Run `go test ./...`, `go vet ./...`, and `gopls check` on Go files (resolving `gopls` from `PATH` or `$(go env GOPATH)/bin/gopls`) and verify all checks pass with zero diagnostics.

# Tasks

## 1. Scanner Purchase Idle Layout

- [x] 1.1 Update `web/src/components/ScannerDrawer.tsx` so the Purchase workflow container (`<div className="space-y-3">`) is rendered only when at least one Purchase-mode sub-section is active (`lookupPhase !== "idle"`, `Boolean(upcHint)`, `Boolean(classifyWarning && lookupPhase === "idle")`, `purchaseSearchHits.length > 0 && !purchaseProduct`, or `Boolean(purchaseProduct || creatingNew)`), removing the empty sibling element that adds 16px of `space-y-4` spacing in idle Purchase mode; verify the modal body has no empty trailing wrapper when idle in Purchase mode.
- [x] 1.2 Add a regression test in `web/src/components/Scanner.test.tsx` verifying that idle `Purchase` mode renders the same compact body child count/structure as idle `Consume` and `Open` modes, that `Transfer` and `Inventory` continue rendering their default location controls, and that active Purchase states (lookup, search hits, or form) still render normally; verify with `npm --prefix web test -- --run src/components/Scanner.test.tsx`.

## 2. Verification

- [x] 2.1 Run the frontend test suite and build (`npm --prefix web test -- --run && npm --prefix web run build`) and verify all tests and build checks pass.
- [x] 2.2 Run `go test ./...`, `go vet ./...`, and `gopls check` on Go files and verify all checks pass with no diagnostics.

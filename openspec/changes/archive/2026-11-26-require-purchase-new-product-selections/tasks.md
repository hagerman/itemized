# Tasks

## 1. Purchase New-Product Selection Behavior

- [x] 1.1 Update `web/src/components/ScannerDrawer.tsx` to stop defaulting `newProdCatId`, `newProdLocId`, and `purchaseLocId` to `categories[0]`/`locations[0]` on unknown barcode scans and unmatched text searches, reset them to `0` in `resetSubState()`, and reset `purchaseLocId`/`newProdLocId` to `0` when clicking `"Create new product instead"`; add a `userEditedCatRef` guard and category existence check before applying `clsRes.classification?.category_id`; verify TypeScript compiles cleanly with `cd web && npx tsc --noEmit`.
- [x] 1.2 Enforce explicit `Category` and `Location` selection in `web/src/components/ScannerDrawer.tsx` by disabling the `Confirm & Add` button when required selections are missing, adding a client-side validation guard in `submitPurchase` that sets `errorMsg` without calling `/api/workflows/purchase`, and updating `HierarchySelect` placeholders to `"Select category"` and `"Select location"`; update the existing new-product purchase test and add unit tests in `web/src/components/Scanner.test.tsx` covering:
  - unknown barcode without LLM category leaves both dropdowns unselected and blocks submission until both are chosen
  - unknown barcode with LLM-classified category pre-fills `Category` while leaving `Location` unselected and blocking submission until `Location` is chosen
  - manually selecting a `Category` while LLM classification is in flight is not overwritten when classification resolves
  - clicking `"Create new product instead"` from an LLM-matched existing product clears `Location` while keeping any LLM-classified `Category`
  - unmatched text search leaves both `Category` and `Location` unselected and blocks submission until both are selected
  - verify all frontend tests pass with `cd web && npm test`.

## 2. Verification

- [x] 2.1 Run full frontend test suite and production build (`cd web && npm test && npm run build`) and verify all tests and build checks pass.
- [x] 2.2 Run Go verification checks (`go test ./...`, `go vet ./...`, and `gopls check` on Go files, resolving `gopls` from `PATH` or `$(go env GOPATH)/bin/gopls`) and confirm zero errors or diagnostics.

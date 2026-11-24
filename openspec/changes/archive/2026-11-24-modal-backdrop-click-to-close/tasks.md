# Tasks

## 1. Shared Modal Backdrop Component

- [x] 1.1 Create `web/src/components/ModalBackdrop.tsx` implementing a reusable dialog overlay (`role="dialog"`, `aria-modal="true"`, `aria-label`, `className`, `onClose`) that closes on backdrop clicks while ignoring clicks inside the dialog panel and pointer drags that start inside the dialog and release on the backdrop; verify with unit tests in `web/src/components/ModalBackdrop.test.tsx` covering backdrop click, inside click, and inside-to-backdrop drag (`cd web && npm test -- ModalBackdrop.test.tsx`).

## 2. Wire Backdrop Dismissal Across All Modal Dialogs

- [x] 2.1 Update `web/src/components/ScannerDrawer.tsx` to wrap its dialog panel with `ModalBackdrop` (`onClose={onClose}`, `ariaLabel="Scanner"`) preserving existing responsive layout classes; add tests in `web/src/components/Scanner.test.tsx` verifying backdrop click closes the scanner and inside click keeps it open (`cd web && npm test -- Scanner.test.tsx`).
- [x] 2.2 Update `web/src/components/BarcodeScanModal.tsx` to wrap its dialog panel with `ModalBackdrop` (`onClose={onClose}`, `ariaLabel={title}`); add a test in `web/src/pages/ProductDetailPage.test.tsx` (or `web/src/components/ModalBackdrop.test.tsx`) verifying clicking outside the Barcode Scan modal closes it while clicking inside keeps it open (`cd web && npm test -- ProductDetailPage.test.tsx`).
- [x] 2.3 Update the Quick Search modal and Keyboard Shortcuts help modal in `web/src/components/Layout.tsx` to use `ModalBackdrop` (`onClose={() => setSearchOpen(false)}` and `onClose={() => setHelpOpen(false)}`); add tests in `web/src/components/Layout.test.tsx` verifying backdrop clicks close both modals and inside clicks keep them open (`cd web && npm test -- Layout.test.tsx`).

## 3. Full Verification

- [x] 3.1 Run the full frontend test suite and production build (`cd web && npm test && npm run build`) and verify all tests and TypeScript/Vite checks pass with zero errors.
- [x] 3.2 Run Go verification (`go test ./...`, `go vet ./...`, and `gopls check` on Go files) to confirm the repository builds and passes all backend checks with embedded web assets.

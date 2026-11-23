# Tasks

## 1. Mobile Default Camera Activation

- [x] 1.1 Add `defaultCameraEnabled?: boolean` to `web/src/components/BarcodeScanner.tsx` (initializing `cameraEnabled` from it and setting `autoFocus={!defaultCameraEnabled}`), and pass mobile viewport/coarse-pointer detection (`isMobileDevice()`) from `web/src/components/ScannerDrawer.tsx`; add Vitest tests in `web/src/components/Scanner.test.tsx` verifying camera starts enabled on mobile and stays hidden by default on desktop, and verify with `cd web && ./node_modules/.bin/vitest run --pool=forks src/components/Scanner.test.tsx`.

## 2. Dynamic Scanner Modal Height & Unclipped HierarchySelect Menus

- [x] 2.1 Update `web/src/components/HierarchySelect.tsx` to support `inlineMenu?: boolean` (in-flow menu expansion for single-column modal pickers) and render standard floating menus via a viewport-anchored `createPortal(..., document.body)` with auto-flip so dropdowns are never clipped by scrollable modals; add unit test coverage in `web/src/components/HierarchySelect.test.tsx` and verify with `cd web && ./node_modules/.bin/vitest run --pool=forks src/components/HierarchySelect.test.tsx`.
- [x] 2.2 Update `web/src/components/ScannerDrawer.tsx` to use `max-h-[92dvh]` (retaining `items-end` on mobile and `sm:items-center` on desktop) and pass `inlineMenu` to the full-width `Transfer` destination and `Inventory` audit location `HierarchySelect` pickers so the modal expands vertically into available space without internal scrolling; verify with `cd web && ./node_modules/.bin/vitest run --pool=forks && ./node_modules/.bin/tsc --noEmit && ./node_modules/.bin/vite build` and `go build ./...`.

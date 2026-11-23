# Design: Mobile Default Camera & Dynamic Scanner Modal Sizing

## Context

See `proposal.md` for motivation. Currently:
- `web/src/components/BarcodeScanner.tsx` initializes `cameraEnabled` to `false` on all devices and unconditionally sets `autoFocus` on the manual input field.
- `web/src/components/ScannerDrawer.tsx` wraps the modal in `fixed inset-0 z-50 flex items-end justify-center bg-black/70 sm:items-center` with an inner card `flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden` and body `flex-1 space-y-4 overflow-y-auto p-4`.
- `web/src/components/HierarchySelect.tsx` renders its open menu with `position: absolute`, which does not contribute to the modal's intrinsic height and gets clipped by the modal body's `overflow-y-auto` / card's `overflow-hidden`, causing internal scrolling inside a short modal (for example, `Location to Audit` in Inventory mode).

## Goals / Non-Goals

**Goals:**
- Start the live camera automatically when `Scan / Action` opens on mobile devices, while keeping it off by default on desktop.
- Prevent mobile virtual keyboards from covering the auto-started camera viewfinder.
- Keep `ScannerDrawer` compact when collapsed, bottom-aligned on mobile, and middle-aligned on desktop, while expanding vertically into available viewport space (`max-h-[92dvh]`) when content or location pickers need more room.
- Ensure `HierarchySelect` menus are never clipped inside `ScannerDrawer` (in Inventory, Transfer, or Purchase modes).

**Non-Goals:**
- Changing barcode decoding engines (`BarcodeDetector` / ZXing) or camera permission prompts.
- Redesigning the `Scan & Action` workflow steps.

## Decisions

### 1. Mobile default camera detection (`BarcodeScanner.tsx` + `ScannerDrawer.tsx`)
Add an optional `defaultCameraEnabled?: boolean` prop to `BarcodeScanner` (defaulting to `false` so standalone usages remain unchanged).
- In `ScannerDrawer`, compute `isMobileDevice()` using `window.matchMedia?.("(max-width: 767px)").matches || window.matchMedia?.("(pointer: coarse)").matches` (guarded for SSR/jsdom where `matchMedia` may be undefined) and pass `defaultCameraEnabled={isMobileDevice()}` to `BarcodeScanner`.
- In `BarcodeScanner`, initialize `useState(defaultCameraEnabled)` and only set `autoFocus={!defaultCameraEnabled}` on the search/barcode input so desktop keeps immediate HID/keyboard focus while mobile doesn't pop up the soft keyboard over the camera.
- Switching modes keeps `BarcodeScanner` mounted, preserving the user's current camera on/off state.

### 2. Dynamic modal height expansion & unclipped `HierarchySelect` menus
- **Modal container (`ScannerDrawer.tsx`)**: Keep `items-end justify-center sm:items-center` on the backdrop and use `max-h-[92dvh]` on the modal card (accounting for mobile dynamic browser toolbars). Because the card has no fixed height, it stays tight for short views and grows automatically up to `92dvh` as content expands, scrolling only when vertical space is exhausted.
- **In-flow expansion for single-column modal pickers (`HierarchySelect.tsx`)**: Add an optional `inlineMenu?: boolean` prop to `HierarchySelect`. When `inlineMenu` is `true` (used for the full-width `Location to Audit` picker in `Inventory` and `Destination Location` picker in `Transfer`), render the open menu in normal document flow (`mt-1 flex max-h-80 flex-col ...`) instead of `position: absolute`. Opening the picker naturally expands the `ScannerDrawer` modal vertically (staying middle-aligned on desktop and bottom-aligned on mobile) with zero clipping and no premature internal scroll.
- **Viewport-anchored portal for floating pickers (`HierarchySelect.tsx`)**: When `inlineMenu` is `false` (default — used in multi-column grids like `Purchase` Category/Location and elsewhere), render the open menu via `createPortal(..., document.body)` with `position: fixed`, positioned from the trigger button's `getBoundingClientRect()` (auto-flipping above the trigger if insufficient space remains below, and closing/repositioning on scroll/resize). This escapes `overflow-y-auto` / `overflow-hidden` ancestors so multi-column grid pickers never clip or create internal scrollbars either.

## Risks / Trade-offs

- **Camera permission denial on mobile**: If a mobile user denies camera permission or uses an insecure HTTP context without `navigator.mediaDevices`, `BarcodeScanner` already catches the error and displays the inline `cameraError` message while keeping manual/HID input fully usable.
- **jsdom test environment**: `window.matchMedia` is not implemented by default in jsdom; guard all `window.matchMedia` calls so tests default cleanly to desktop (`false`) unless explicitly mocked.

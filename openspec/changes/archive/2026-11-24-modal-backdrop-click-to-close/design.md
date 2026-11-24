# Design

## Context

See `proposal.md` for motivation. The web UI currently renders four modal dialogs (`role="dialog"`):

1. `ScannerDrawer` (`web/src/components/ScannerDrawer.tsx`)
2. `BarcodeScanModal` (`web/src/components/BarcodeScanModal.tsx`)
3. Quick Search modal (`web/src/components/Layout.tsx`)
4. Keyboard Shortcuts help modal (`web/src/components/Layout.tsx`)

All four use the same structural pattern: a full-viewport backdrop container (`fixed inset-0 z-50 ... bg-black/70`) wrapping a single modal panel child `<div>`. None of the four attach click handlers to the backdrop today (unlike the mobile navigation drawer in `Layout.tsx`, which already closes when its overlay is clicked).

## Goals / Non-Goals

**Goals:**
- Provide consistent click/tap-outside dismissal across all four modal dialogs without duplicating fragile event-handling logic.
- Prevent accidental dismissal when a user starts a pointer interaction inside the dialog (e.g., dragging to highlight text in an input) and releases on the backdrop.
- Keep existing close paths (`X` button, `Escape` shortcut, scan capture) and visual styling unchanged.

**Non-Goals:**
- Introducing a third-party dialog library or rewriting modal positioning/animations.
- Changing focus-trap or `Escape` key handling beyond existing behavior.
- Modifying the mobile navigation drawer, which already supports backdrop click-to-close.

## Decisions

### 1. Shared reusable `ModalBackdrop` wrapper component (or hook)
Create a small, focused `ModalBackdrop` component (e.g., `web/src/components/ModalBackdrop.tsx`) that renders the `fixed inset-0 z-50` overlay container (`role="dialog"`, `aria-modal="true"`, `aria-label`, `className`) and encapsulates the backdrop click-to-close logic, then use it in `ScannerDrawer`, `BarcodeScanModal`, and the two modals in `Layout.tsx`.

- **Why:** Centralizes the drag-safe backdrop dismissal logic in one place so all current and future modals behave identically and cannot drift.
- **Alternative considered:** Adding inline `onMouseDown`/`onClick` handlers to each of the four modals. Rejected because tracking pointer-down origin requires a ref per modal and would duplicate boilerplate across three files.

### 2. Guard against inside-to-outside pointer drags without breaking synthetic click events
Inside `ModalBackdrop`, track a ref `mouseDownOnBackdropRef` (or `mouseDownInsideRef` defaulting to `false`):
- On `onMouseDown` (on the backdrop): set `mouseDownInsideRef.current = e.target !== e.currentTarget`.
- On `onClick` (on the backdrop): if `mouseDownInsideRef.current` is `true`, reset it to `false` and do not close. Otherwise, if `e.target === e.currentTarget`, call `onClose()`.

- **Why:** In browsers, pressing mouse down inside an `<input>` and dragging out onto the backdrop before releasing dispatches a `click` event whose `target` is the common ancestor (the backdrop itself), so `e.target === e.currentTarget` alone would mistakenly close the modal. Recording `mouseDownInsideRef` (instead of requiring `mouseDownOnBackdropRef === true`) also preserves compatibility with synthetic `click` events (such as assistive tech or `fireEvent.click(backdrop)` in unit tests) that do not fire a preceding `mousedown`.
- **Alternative considered:** Calling `onClose()` directly on `onMouseDown` when `e.target === e.currentTarget`. Rejected because closing on mouse-down prevents users from cancelling an accidental press by moving the pointer away before releasing, and can cause click-through to elements underneath on touch devices.

## Risks / Trade-offs

- **Risk:** Touch or synthetic events firing `onClick` after an aborted drag could leave `mouseDownInsideRef` stale if no `click` event fires after `mousedown`. → **Mitigation:** `onMouseDown` always overwrites `mouseDownInsideRef.current` on the next press, so any subsequent click starting on the backdrop resets the flag to `false` before `onClick` runs.
- **Risk:** `ScannerDrawer` stops camera streams when `open` transitions to `false`; closing via backdrop must follow the same `onClose` callback. → **Mitigation:** `ModalBackdrop` invokes the existing `onClose` prop directly (e.g., `() => setScannerOpen(false)`), reusing the exact same cleanup lifecycle as the `X` button.

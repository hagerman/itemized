# Design

## Context

See `proposal.md` for motivation. Currently, `Layout.tsx` always mounts `<ScannerDrawer open={scannerOpen} initialMode={scannerMode} ... />`, and `ScannerDrawer.tsx` returns `null` when `!open` after declaring all 35+ workflow `useState` and `useRef` hooks. Because `ScannerDrawer` stays mounted while closed, all partially entered state persists across close/reopen. Meanwhile, both `Scan / Action` triggers in `Layout.tsx` (desktop sidebar and mobile bottom dock) explicitly call `setScannerMode("purchase"); setScannerOpen(true);`, and no mode preference is stored in `localStorage`.

## Goals / Non-Goals

**Goals:**
- Guarantee that closing and reopening `Scan / Action` clears 100% of transient workflow, form, lookup, selection, destination, audit, and notification state—including future state fields added to the drawer.
- Discard in-flight async UPC lookup / LLM classification responses if the modal closes before they resolve.
- Persist the user's selected `ScanMode` per browser in `localStorage` and restore it on every open (including across page reloads), safely falling back to `purchase` if storage is empty, invalid, or inaccessible.
- Keep switching modes *while the modal stays open* preserving the live camera stream (existing requirement).

**Non-Goals:**
- Persisting scan mode on the server/user profile across different browsers or devices (the requirement is explicitly per-browser).
- Changing `BarcodeScanner` camera/torch behavior or any backend API endpoints.
- Changing mode-switching reset behavior while the modal remains open (except ensuring `resetSubState` remains consistent).

## Decisions

### 1. Split `ScannerDrawer` into an outer shell and an unmount-on-close `ScannerDrawerContent`
- **Decision:** Keep `ScannerDrawer`'s existing prop signature (`open`, `initialMode?`, `onClose`, `categories`, `locations`). When `!open`, `ScannerDrawer` returns `null` before rendering `<ScannerDrawerContent />`. All workflow state (`purchaseProduct`, `creatingNew`, `newProdName`, `candidateItems`, `transferDest`, `invLocation`, `statusMsg`, `errorMsg`, `toast`, refs, etc.) lives inside `ScannerDrawerContent`.
- **Rationale:** Unmounting `ScannerDrawerContent` on close automatically resets every `useState` and `useRef` (and unmounts `BarcodeScanner`), making it impossible to accidentally leave stale fields behind now or when future state is added. An unmount cleanup effect in `ScannerDrawerContent` increments `lookupSeqRef.current` so any in-flight `/api/upc/lookup` or `/api/upc/classify` promise resolves as stale and does nothing.
- **Alternative considered:** Adding every state setter to `resetSubState()` and calling it in a `useEffect` when `open` changes. Rejected because `resetSubState()` already misses ~20 state variables (`newProdName`, `transferDest`, `invLocation`, `invScannedItemIds`, `toast`, etc.) and would remain a maintenance hazard.

### 2. Persist `ScanMode` in `localStorage` via a validated helper
- **Decision:** Define a `SCAN_MODE_STORAGE_KEY = "itemized.scanMode"` constant and safe `readSavedScanMode()` / `writeSavedScanMode(mode)` helpers in `ScannerDrawer.tsx` that validate values against `MODES` (`purchase | consume | open | transfer | inventory`) and catch storage exceptions (e.g., private mode / disabled storage).
  - `ScannerDrawer` initializes its `mode` state with `readSavedScanMode() ?? initialMode ?? "purchase"`.
  - When the user clicks a mode tab inside `ScannerDrawerContent`, `onModeChange(m.id)` updates `mode` and calls `writeSavedScanMode(m.id)`.
  - `Layout.tsx` removes `scannerMode` state and the `setScannerMode("purchase")` calls on both desktop sidebar and mobile dock buttons, simply calling `setScannerOpen(true)` and rendering `<ScannerDrawer open={scannerOpen} onClose={() => setScannerOpen(false)} categories={categories} locations={locations} />`.
- **Rationale:** Keeping persistence in `ScannerDrawer` means any caller gets sticky mode behavior automatically while preserving the optional `initialMode` fallback prop for callers/tests when `localStorage` has no saved value. Keeping `mode` in the outer `ScannerDrawer` (and syncing to `localStorage`) ensures switching modes inside `ScannerDrawerContent` never unmounts `BarcodeScanner` (preserving the active camera stream).
- **Alternative considered:** Managing `localStorage` in `Layout.tsx` and passing `mode` / `onModeChange` props down. Rejected because it splits scanner mode persistence across two components and requires every `ScannerDrawer` consumer/test to wire persistence separately.

## Risks / Trade-offs

- **[Risk] Existing Vitest tests in `Scanner.test.tsx` share `jsdom`'s `localStorage` across test cases** → Mitigation: Clear `localStorage` in `beforeEach` in `Scanner.test.tsx` (and `Layout.test.tsx` where relevant) so a mode switch in one test cannot leak into subsequent tests.
- **[Risk] `localStorage` may throw in restricted browser environments (Safari private browsing / blocked storage)** → Mitigation: Wrap `localStorage.getItem` and `localStorage.setItem` in `try/catch`, falling back gracefully to in-memory React state (`mode` in outer `ScannerDrawer`) and `"purchase"` default.

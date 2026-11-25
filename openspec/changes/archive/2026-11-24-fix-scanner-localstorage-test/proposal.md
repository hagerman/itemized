# Proposal

## Why

CI (`ubuntu-latest`, Node 22) fails in `web/src/components/Scanner.test.tsx` (`persists chosen scan mode in localStorage across remounts and falls back to Purchase on invalid or unavailable storage`), even though the test passes locally on Node 26. On Node 22, jsdom's native `window.localStorage` is a WebIDL `Storage` Proxy whose named-property setter intercepts `vi.spyOn(window.localStorage, "getItem")`, storing a stringified function under the key `"getItem"` instead of overriding `Storage.prototype.getItem`. Locally on Node 26, `web/src/test/setup.ts` replaces `window.localStorage` with a plain JS object, hiding the bug.

## What Changes

- Update the unavailable-storage assertion block in `web/src/components/Scanner.test.tsx` to replace `window.localStorage` via `Object.defineProperty(window, "localStorage", ...)` with a throwing mock `Storage` object (and restore the original property descriptor in a `finally` block), rather than calling `vi.spyOn(window.localStorage, "getItem")` / `vi.spyOn(window.localStorage, "setItem")`.
- Add coverage in that same test for accessing `window.localStorage` itself throwing (as happens in locked-down browser privacy modes), verifying `ScannerDrawer` still falls back to `Purchase` and allows switching modes without crashing.

## Capabilities

### New Capabilities

_(None — no new system behavior.)_

### Modified Capabilities

_(None — existing `barcode-scanning` requirements are unchanged; this is a test-only fix. `skip_specs: true` is set in `.openspec.yaml`.)_

## Impact

- Affected file: `web/src/components/Scanner.test.tsx`
- No production code, API, or spec changes.
- Restores green CI on Node 22 while remaining compatible with Node 25/26 local runs.

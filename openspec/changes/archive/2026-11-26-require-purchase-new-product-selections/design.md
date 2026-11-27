# Design

## Context

See `proposal.md` for motivation and scope, and `specs/barcode-scanning/spec.md` for behavioral requirements.

In `web/src/components/ScannerDrawer.tsx`, the Purchase workflow uses `HierarchySelect` (a custom button-based dropdown, not a native `<select required>`) for both `New product category` (`newProdCatId`) and `Purchase location` (`purchaseLocId` / `newProdLocId`). Currently, entering the new-product creation path initializes all three IDs to `categories[0]?.id || 0` and `locations[0]?.id || 0` in two places:
1. Unknown numeric barcode scan (`handlePurchaseScan`, lines 443–445).
2. Unmatched text search (`handlePurchaseScan`, lines 554–556).

Additionally, when LLM classification returns `matched_product_id`, `purchaseLocId` is populated from `mp.default_location_id`. Clicking `"Create new product instead"` switches back to `creatingNew = true` without clearing `purchaseLocId` / `newProdLocId`, leaving the matched product's location selected for the new product.

The backend (`POST /api/workflows/purchase` → `productInput.validate()` in `internal/api/catalog.go`) already requires `category_id > 0` and `default_location_id > 0`, returning HTTP 422 otherwise.

## Goals / Non-Goals

**Goals:**
- Ensure new-product purchase flows never fall back to `categories[0]` or `locations[0]`.
- Preserve existing-product default location pre-fill and LLM category pre-fill (respecting manual user edits made while classification is in flight).
- Enforce client-side selection of both `Category` and `Location` before `POST /api/workflows/purchase` is called, matching existing ScannerDrawer UX conventions.

**Non-Goals:**
- Changing backend validation or API payload schemas.
- Modifying `ProductFormPage.tsx` (standalone product creation outside Purchase mode).
- Adding a global "default location" household setting.

## Decisions

### 1. Clear initial state to `0` across all new-product entry points and state resets
- **Choice**: Initialize `newProdCatId`, `newProdLocId`, and `purchaseLocId` to `0` on unknown barcode scan, unmatched text search, `resetSubState()`, and `"Create new product instead"`.
- **Rationale**: Keeps `HierarchySelect` at `value={null}` so its placeholder (`"Select category"` / `"Select location"`) is displayed whenever no real default exists.
- **Alternative considered**: Keeping the matched product's `default_location_id` on `"Create new product instead"`. Rejected because the user explicitly said the scanned item is *not* that matched product, so inheriting its location would silently apply a default that doesn't belong to the new product.

### 2. Guard LLM category pre-fill with `userEditedCatRef`
- **Choice**: Add a `userEditedCatRef` (mirroring the existing `userEditedNameRef`, `userEditedProdMeasRef`, and `userEditedVarMeasRef`) that is reset on new scan / `resetSubState()`, set to `true` when the user selects a category, and checked before applying `clsRes.classification?.category_id`. Also verify the returned `category_id` exists in `categories` (or is truthy) before applying.
- **Rationale**: Because the Create New form appears as soon as OpenFoodFacts responds while LLM classification runs asynchronously, a user can pick a category before classification finishes. Without a ref guard, the late classification response would overwrite their explicit choice.

### 3. Enforce selection via both disabled submit button and `submitPurchase` validation guard
- **Choice**:
  - Compute `missingRequiredSelection`:
    - When `creatingNew`: `!newProdCatId || !purchaseLocId`
    - When purchasing an existing product: `!purchaseLocId` (defensive, in case an existing product ever lacks a location)
  - Disable the `Confirm & Add` button when `missingRequiredSelection` is true (using `disabled:cursor-not-allowed disabled:opacity-50`, matching the `Complete Transfer` button in `ScannerDrawer.tsx`).
  - Also validate at the top of `submitPurchase(e)` before calling `apiFetch("/api/workflows/purchase", ...)`: if `creatingNew && !newProdCatId` and/or `!purchaseLocId`, set `errorMsg` naming the missing field(s) (e.g. `"Please select a category and location."`, `"Please select a category."`, or `"Please select a location."`) and return early.
  - Update `HierarchySelect` placeholders from `"Category"` / `"Location"` to `"Select category"` / `"Select location"` so the unselected state is immediately actionable.
- **Rationale**: Disabling the button provides immediate visual feedback consistent with Transfer mode, while the `submitPurchase` guard protects against programmatic or Enter-key form submissions and surfaces a clear error message if triggered.
- **Alternative considered**: Leaving the submit button enabled and relying solely on click-time validation. Rejected because `ScannerDrawer` already uses disabled buttons for missing required selections (Transfer destination), and disabling prevents accidental taps while still showing clear unselected placeholders.

## Risks / Trade-offs

- **[Existing test updates]** → `Scanner.test.tsx` has an existing new-product purchase test that relied on `locations[0]` being auto-selected before clicking `Confirm & Add`. Updating that test to explicitly pick a location (and adding dedicated tests for the new behavior) keeps the suite accurate and verifies the requirement.
- **[Invalid LLM `category_id`]** → If the LLM somehow returned a `category_id` not present in the `categories` prop, `HierarchySelect` would render as unselected while `newProdCatId` was non-zero. Checking `categories.some((c) => c.id === clsId)` before setting `newProdCatId` prevents a mismatch between state and UI.

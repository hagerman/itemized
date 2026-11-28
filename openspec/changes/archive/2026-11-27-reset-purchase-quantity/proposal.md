# Proposal

## Why

In the `Scan & Action` Purchase workflow, `resetSubState()` omits `purchaseQty` (along with pack quantities, variant selection/expansion, new-product name, and label print mode). When a user purchases a product with a custom quantity (such as `10`) and then starts a subsequent purchase—especially for a new product via an unknown barcode or unmatched text search, where `purchaseQty` is not overwritten by a known barcode's `default_quantity`—the Quantity field remains `10` instead of resetting to `1`, making it easy to accidentally add the wrong number of items.

## What Changes

- Reset `purchaseQty` to `1` (as well as `purchaseBarcodeQty` to `1`, `secondBarcodeQty` to `1`, `variantId` to `null`, `showVariantSection` to `false`, `newProdName` to `""`, and `purchasePrintMode` to `"per_item"`) inside `resetSubState()` when a purchase is submitted or when switching scan modes.
- Reset `purchaseQty` to `1` and clear stale barcode/pack/variant/new-product state when initiating a new unknown-barcode lookup or text search in `handlePurchaseScan`, so starting a new purchase scan without submitting the previous form also defaults to quantity `1`.
- Add regression tests in `web/src/components/Scanner.test.tsx` verifying that quantity resets to `1` across consecutive new-product purchases (both unknown barcode and unmatched text search) and when starting a new scan after editing quantity.

## Capabilities

### New Capabilities

<!-- None -->

### Modified Capabilities

- `barcode-scanning`: Require the Streamlined Purchase workflow to reset `Quantity` (to `1`) and other transient purchase form fields after submitting a purchase or starting a new unknown-barcode or text-search purchase so subsequent purchases never inherit a previous purchase's quantity.

## Impact

- Affected frontend code: `web/src/components/ScannerDrawer.tsx`
- Affected frontend tests: `web/src/components/Scanner.test.tsx`
- No backend, API, or database changes required.

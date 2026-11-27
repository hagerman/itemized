# Proposal

## Why

When purchasing a new product in the Scanner Purchase workflow, the form currently pre-populates the Category and Location dropdowns with the first item in each list (`categories[0]` and `locations[0]`) whenever no default value is available. This makes it easy to accidentally create products and items in the wrong category or location without noticing.

## What Changes

- Stop defaulting `Category` and `Location` to the first dropdown item (`categories[0]` / `locations[0]`) when creating a new product in the Purchase workflow (`ScannerDrawer`).
- Preserve automatic pre-population when a real default exists:
  - Existing products (via known barcode, product/item QR, search match, or LLM-matched product) continue to pre-fill `Location` from `product.default_location_id`.
  - New products classified by the LLM continue to pre-fill `Category` from `classification.category_id` when returned (without overwriting a category the user already selected manually).
- When switching from an LLM-matched existing product to `"Create new product instead"`, clear the location inherited from the matched product so the user must explicitly select a location for the new product (while retaining any LLM-classified category).
- Force the user to explicitly select a `Category` and `Location` before submitting a new product purchase:
  - Disable the `Confirm & Add` submit button until required selections are made (and show clear unselected placeholders).
  - Guard form submission in `submitPurchase` with client-side validation that blocks the API request and displays a clear error message if `Category` or `Location` is missing.
- Keep standalone product creation (`ProductFormPage`) unchanged and out of scope for this change.

## Capabilities

### New Capabilities
<!-- None -->

### Modified Capabilities
- `barcode-scanning`: Update the `Streamlined Purchase workflow` requirement so new products without a default location or LLM-classified category leave those dropdowns unselected and require explicit user selection before submission.

## Impact

- **Frontend UI**: `web/src/components/ScannerDrawer.tsx` (Purchase workflow state initialization, `"Create new product instead"` handler, `resetSubState`, submit validation, and button disabled state).
- **Frontend Tests**: `web/src/components/Scanner.test.tsx` (update existing new-product purchase test to select a location; add unit tests covering unselected defaults, LLM category pre-fill without location default, `"Create new product instead"` location reset, text-search new product creation, and submission blocking until both category and location are selected).
- **Backend / API**: No backend changes required; `POST /api/workflows/purchase` (`productInput.validate()`) already validates that `category_id` and `default_location_id` are positive integers and rejects missing values with HTTP 422.

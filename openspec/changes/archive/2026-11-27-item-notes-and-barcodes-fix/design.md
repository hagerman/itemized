# Design

## Context

See `proposal.md` for motivation. Investigation of the codebase revealed two distinct issues:

1. **Product detail crash (`ee.barcodes is undefined`)**:
   - In `internal/api/catalog.go:59`, `Variant.Barcodes` is declared as `[]Barcode \`json:"barcodes,omitempty"\``.
   - In Go's `encoding/json`, `omitempty` omits empty slices (`len == 0`) even when explicitly initialized via `v.Barcodes = []Barcode{}` in `listVariantsWithBarcodes` and `handleCreateVariant`.
   - Any product containing a variant with zero barcodes therefore returns a JSON variant object missing the `barcodes` key. `web/src/pages/ProductDetailPage.tsx:717` executes `v.barcodes.map(...)` unguarded, crashing the page. (Existing frontend tests in `ProductDetailPage.test.tsx` mocked `barcodes: []`, masking the backend omission.)
   - Note: the `cloudflareinsights.com` CORS/SRI console messages in the user's report come from Cloudflare Web Analytics injection on the deployed domain and are unrelated to the React crash.

2. **Item notes visibility and editing**:
   - The database schema (`items.notes TEXT`), item queries (`listItemsByProduct`, `getItemByID`), `POST /api/items`, `PATCH /api/items/:id`, and TypeScript `Item.notes: string | null` already exist.
   - `PATCH /api/items/:id` uses `patchNullableString`, which converts `""` and `null` to `nil` but preserves whitespace-only strings such as `"   "`.
   - `ProductDetailPage.tsx` does not render `it.notes` or provide any way to edit item notes.
   - `QrActionPage.tsx` renders `item.notes` (read-only) on `/go/i/:id` but has no edit control.

## Goals / Non-Goals

**Goals:**
- Guarantee `Variant.Barcodes` always serializes as a JSON array (`[]` when empty) across all API endpoints returning `Variant`.
- Make `ProductDetailPage.tsx` defensive against omitted/null `barcodes` on variants.
- Trim item `notes` on `PATCH /api/items/:id` so whitespace-only input clears the note to `null`.
- Display item `notes` and provide clean inline add/edit/clear UX on `/products/:id` (both mobile cards and desktop table) and `/go/i/:id`.

**Non-Goals:**
- Bulk note editing in the `/api/items/bulk` toolbar (notes are typically per-unit; can be added later if requested).
- Adding a dedicated notes column to the main `/products` inventory list or location detail list.
- Changing legacy import logic (notes are already imported into `items.notes`).

## Decisions

### 1. Always serialize `Variant.Barcodes` as a JSON array + frontend guard
- **Decision**: Change `Variant.Barcodes` struct tag in `internal/api/catalog.go` from `json:"barcodes,omitempty"` to `json:"barcodes"`, verify every `Variant` construction initializes `Barcodes: []Barcode{}` (avoiding JSON `null`), and update `ProductDetailPage.tsx` to use `(v.barcodes ?? []).map(...)`.
- **Rationale**: Removing `omitempty` fixes the API contract at the source so TypeScript's `Variant.barcodes: Barcode[]` matches runtime JSON. Adding the `?? []` guard in the frontend provides defense-in-depth against cached or partial responses.
- **Alternative considered**: Only fixing the frontend with `v.barcodes?.map(...)`. Rejected because the API contract itself was violating the declared `Barcode[]` type for every zero-barcode variant.

### 2. Trim `notes` in `handleUpdateItem`
- **Decision**: In `internal/api/items.go`, trim whitespace when patching `notes` (either via a dedicated helper or by trimming in `handleUpdateItem` before persistence) so `""` and `"   "` both clear `notes` to `NULL`, while non-empty strings store their trimmed text.
- **Rationale**: Prevents accidental invisible notes from whitespace-only edits without affecting date fields handled by `patchNullableString`.

### 3. Inline item note display and editing on `/products/:id`
- **Decision**:
  - Track a single active note editor in `ProductDetailPage.tsx` (`editingNoteItemId: number | null`, `noteDraft: string`, `savingNote: boolean`), matching the existing inline variant-editing pattern in the same file.
  - **Mobile card view**: Render `it.notes` in a subtle wrapped block (`whitespace-pre-wrap break-words`) when present, with a compact `Edit note` / `Add note` button (with accessible `aria-label`, e.g., `Edit note for item #<id>` / `Add note for item #<id>`). When editing, replace/expand into a compact inline `<textarea>` (2 rows) with `Save` and `Cancel` buttons.
  - **Desktop table view**: Add a `Notes` column (between `Due` and `Actions`) showing the note text (wrapped cleanly, with a subtle edit icon button) or a subtle `+ Note` button when empty. When editing that row, render the inline input/textarea + `Save`/`Cancel` controls inside the cell.
  - Submitting calls `PATCH /api/items/${itemId}` with `{ notes: noteDraft.trim() || null }`, shows inline error feedback via `errorMsg` on failure, and calls `refresh()` on success.
- **Rationale**: Keeps the UI lightweight (no modal required), consistent with existing inline variant CRUD on `ProductDetailPage`, and preserves zero horizontal scrolling on mobile.
- **Alternative considered**: A modal dialog for editing full item details. Rejected for now because only notes editing is requested and inline editing requires fewer clicks and less UI chrome.

### 4. Inline note editing on `/go/i/:id` (`QrActionPage.tsx`)
- **Decision**: Add a compact `Add note` / `Edit note` button alongside the existing `item.notes` display on `/go/i/:id` that toggles a 2-row `<textarea>` with `Save` and `Cancel`, calling `PATCH /api/items/:id` and updating the local `resolution` state (plus invalidating inventory queries).
- **Rationale**: Users scanning a physical item's QR code often want to jot down or update a note (e.g., "Half used", "Opened for soup") right on that screen, and `QrActionPage` already displays `item.notes` and calls `PATCH /api/items/:id`.

## Risks / Trade-offs

- **Desktop table width with added `Notes` column** → Use `max-w-xs break-words whitespace-pre-wrap` on the Notes cell so long legacy notes wrap vertically instead of stretching the table horizontally.
- **Multi-line legacy notes** → Using `<textarea rows={2}>` with `whitespace-pre-wrap` preserves line breaks from legacy imports instead of collapsing them as a single-line `<input>` would.
- **Concurrent edits when refreshing** → Close the inline editor only after `PATCH /api/items/:id` succeeds; preserve the draft and show `errorMsg` if the request fails.

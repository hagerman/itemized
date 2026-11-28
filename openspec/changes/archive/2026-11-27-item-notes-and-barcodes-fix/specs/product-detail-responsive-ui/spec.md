## MODIFIED Requirements

### Requirement: Responsive Items in Stock presentation without horizontal scrolling
The `Items in Stock` section on `/products/:id` SHALL render each item as a self-contained vertical card on mobile viewports (displaying selection checkbox, item variant/location, purchased/opened/due dates, item notes when present, an inline control to add/edit/clear notes, and full-width single-row `Open`, `Consume`, and—when a printer is configured—`Print` action buttons) with zero horizontal scrolling, and SHALL render the full multi-column table with item notes, inline note editing, and non-wrapping action buttons (omitting `Print` when no printers are configured) on desktop viewports.

#### Scenario: Viewing and acting on items on mobile
- **WHEN** `printers_enabled` is `true` and a user views `Items in Stock` on a mobile viewport
- **THEN** each item renders in a stacked card with all metadata and `Open`, `Consume`, and `Print` buttons fitting cleanly in a 3-column row within the viewport width without horizontal overflow
- **AND** selecting item checkboxes still activates the bulk action bar

#### Scenario: Viewing items on mobile and desktop without a printer configured
- **WHEN** `printers_enabled` is `false` and a user views `Items in Stock` on `/products/:id`
- **THEN** per-item `Print` buttons are omitted from both mobile item cards (rendering `Open` and `Consume` in a balanced 2-column row) and desktop table rows

#### Scenario: Viewing and editing item notes on product detail
- **WHEN** an item on `/products/:id` has `notes` (for example from a legacy import)
- **THEN** the note text is displayed for that item in both mobile card and desktop table views
- **AND** clicking the item's note edit control opens an inline editor pre-filled with the current note, allowing the user to save updated text or clear the note via `PATCH /api/items/:id` and see the refreshed value

#### Scenario: Adding a note to an item with no existing note
- **WHEN** an item on `/products/:id` has `notes: null` and a user clicks the add-note control, enters text, and saves
- **THEN** the UI sends `PATCH /api/items/:id` with the trimmed note text and displays the saved note on the item

## ADDED Requirements

### Requirement: Resilient variant barcode rendering
The `Variants & Barcodes` section on `/products/:id` SHALL render variants safely when a variant has zero barcodes or when `barcodes` is omitted/null in the API response, without throwing a runtime error.

#### Scenario: Product with a zero-barcode variant loads cleanly
- **WHEN** a user opens `/products/:id` for a product whose variant has no barcodes (or whose API payload omits `barcodes`)
- **THEN** the page renders the product, its items, and its variant card (including the Add Barcode form) without runtime errors

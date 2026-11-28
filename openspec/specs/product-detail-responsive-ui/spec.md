# product-detail-responsive-ui Specification

## Purpose

Ensures the `/products/:id` detail page renders cleanly across mobile and desktop viewports with single-row header actions and zero horizontal table overflow for items in stock.

## Requirements

### Requirement: Single-row responsive product header actions
On `/products/:id`, the top action controls (`Add to List` / `On List`, `Print Label` when a printer is configured, `Edit`, `Delete`) SHALL stay right-aligned on a single horizontal row (icon-only on mobile, icon + text on wider viewports), sharing the title line when space permits and wrapping right-aligned onto a second row otherwise. `Print Label` SHALL be omitted when `printers_enabled` is `false`.

#### Scenario: Narrow mobile viewport keeps actions on one row
- **WHEN** a user opens `/products/:id` on a mobile viewport
- **THEN** all visible header actions render as compact, right-aligned icon buttons on one row without wrapping amongst themselves, and each button has an accessible label describing its action

#### Scenario: Narrow mobile viewport with short title fits header actions on the same line
- **WHEN** a user opens `/products/:id` on a mobile viewport and the back button, product title/subtitle, and compact icon action buttons fit within the available header width
- **THEN** all visible action buttons render on the same horizontal line as the title, aligned to the right edge of the header

#### Scenario: Narrow mobile viewport with long title wraps header actions right-aligned
- **WHEN** a user opens `/products/:id` on a mobile viewport and the product title or category/location subtitle is too wide to share a line with the header action buttons
- **THEN** the visible action buttons wrap together onto a single right-aligned row below the title without horizontal overflow

#### Scenario: Header omits Print Label button when no printers are configured
- **WHEN** `printers_enabled` is `false` and a user opens `/products/:id`
- **THEN** the `Print Product Label` button is not rendered while `Add to List` / `On List`, `Edit`, and `Delete` remain right-aligned on a single row

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

### Requirement: Resilient variant barcode rendering
The `Variants & Barcodes` section on `/products/:id` SHALL render variants safely when a variant has zero barcodes or when `barcodes` is omitted/null in the API response, without throwing a runtime error.

#### Scenario: Product with a zero-barcode variant loads cleanly
- **WHEN** a user opens `/products/:id` for a product whose variant has no barcodes (or whose API payload omits `barcodes`)
- **THEN** the page renders the product, its items, and its variant card (including the Add Barcode form) without runtime errors

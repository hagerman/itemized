# Spec Delta

## MODIFIED Requirements

### Requirement: Responsive Items in Stock presentation without horizontal scrolling
The `Items in Stock` section on `/products/:id` SHALL render each item as a self-contained vertical card on mobile viewports (displaying selection checkbox, item variant/location, purchased/opened/due dates, item notes when present, an inline control to add/edit/clear notes, and full-width single-row action buttons: `Open` only when `opened_on_date` is unset, `Consume`, and—when a printer is configured—`Print`) with zero horizontal scrolling, and SHALL render the full multi-column table with item notes, inline note editing, and non-wrapping action buttons (omitting `Open` when `opened_on_date` is set and omitting `Print` when no printers are configured) on desktop viewports. In the bulk item actions bar, `Open` SHALL be omitted when all selected items already have `opened_on_date` set.

#### Scenario: Viewing and acting on items on mobile
- **WHEN** `printers_enabled` is `true` and a user views `Items in Stock` on a mobile viewport for an unopened item
- **THEN** the item renders in a stacked card with all metadata and `Open`, `Consume`, and `Print` buttons fitting cleanly in a 3-column row within the viewport width without horizontal overflow
- **AND** selecting item checkboxes still activates the bulk action bar

#### Scenario: Viewing items on mobile and desktop without a printer configured
- **WHEN** `printers_enabled` is `false` and a user views `Items in Stock` on `/products/:id` for an unopened item
- **THEN** per-item `Print` buttons are omitted from both mobile item cards (rendering `Open` and `Consume` in a balanced 2-column row) and desktop table rows

#### Scenario: Already-opened item omits Open button on mobile and desktop
- **WHEN** an item in `Items in Stock` on `/products/:id` already has `opened_on_date` set
- **THEN** the per-item `Open` button is not rendered in either the desktop table row or the mobile item card
- **AND** on mobile, the remaining action buttons (`Consume` and, when `printers_enabled` is `true`, `Print`) adjust to a balanced 2-column (with printer) or 1-column (without printer) row without an empty button slot

#### Scenario: Bulk actions bar omits Open when all selected items are already opened
- **WHEN** a user selects one or more items on `/products/:id` and every selected item already has `opened_on_date` set
- **THEN** the bulk item actions bar does not render the `Open` button
- **AND** when the selection includes at least one unopened item, the bulk `Open` button is rendered

#### Scenario: Viewing and editing item notes on product detail
- **WHEN** an item on `/products/:id` has `notes` (for example from a legacy import)
- **THEN** the note text is displayed for that item in both mobile card and desktop table views
- **AND** clicking the item's note edit control opens an inline editor pre-filled with the current note, allowing the user to save updated text or clear the note via `PATCH /api/items/:id` and see the refreshed value

#### Scenario: Adding a note to an item with no existing note
- **WHEN** an item on `/products/:id` has `notes: null` and a user clicks the add-note control, enters text, and saves
- **THEN** the UI sends `PATCH /api/items/:id` with the trimmed note text and displays the saved note on the item

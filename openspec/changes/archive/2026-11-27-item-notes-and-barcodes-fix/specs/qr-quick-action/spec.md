## MODIFIED Requirements

### Requirement: Item QR quick actions
When viewing an in-stock item on `/go/i/:id`, the screen SHALL display the item's product name, variant (if present), current location, due date (with overdue or due-soon visual indicator), opened status, and notes, and SHALL provide an inline control to add, edit, or clear the item's notes (`PATCH /api/items/:id`) as well as prominent one-tap actions to:
- **Consume** the item (`POST /api/items/:id/consume`) with an inline **Undo** control that restores `consumed_on_date` to `null` via `PATCH /api/items/:id`
- **Open** the item (`POST /api/items/:id/open`) when not yet opened, updating its due date per `default_due_days_on_open` and providing an inline **Undo** control that restores its previous `opened_on_date` and `due_on_date`
- **Transfer** the item to another location (`POST /api/items/:id/transfer`) via a hierarchical location picker, applying freeze/thaw due-date rules and displaying the updated location and due date
- **Toggle Shopping List** for the item's product (`POST /api/products/:productId/toggle-shopping-list`)
- Navigate to the full product detail page (`/products/:productId`)

When the scanned item is already consumed (`consumed_on_date` is set), the screen SHALL clearly display that it was already consumed (including the consumption date), SHALL NOT show a Consume button, and SHALL provide a **Restore / Unconsume** action (`PATCH /api/items/:id` with `consumed_on_date: null`) and a link to the full product detail page.

#### Scenario: Consuming an in-stock item and undoing
- **WHEN** a user opens `/go/i/42` for an in-stock item, taps **Consume**, and then taps **Undo**
- **THEN** tapping **Consume** marks item `42` consumed and displays a confirmation state with an **Undo** button, and tapping **Undo** clears `consumed_on_date` and returns the item to its in-stock quick-action state

#### Scenario: Opening an unopened item
- **WHEN** a user opens `/go/i/42` for an unopened in-stock item and taps **Open**
- **THEN** the item is marked opened via `POST /api/items/42/open`, its updated opened and due dates are displayed, and an **Undo** button allows restoring the previous opened and due dates

#### Scenario: Transferring an item to a freezer location
- **WHEN** a user opens `/go/i/42`, taps **Transfer**, selects a freezer destination location, and confirms
- **THEN** the item is moved via `POST /api/items/42/transfer`, freeze due-date rules are applied, and the screen updates to show the new location and updated due date

#### Scenario: Scanning an already-consumed item QR
- **WHEN** a user opens `/go/i/42` for an item with `consumed_on_date = "2026-11-20"`
- **THEN** the screen displays an already-consumed notice showing `2026-11-20`, provides a **Restore / Unconsume** button that clears `consumed_on_date`, and links to `/products/:productId`

#### Scenario: Toggling shopping list from an item QR screen
- **WHEN** a user opens `/go/i/42` and taps **Add to Shopping List**
- **THEN** `POST /api/products/:productId/toggle-shopping-list` is called and the button updates to reflect that the product is on the shopping list

#### Scenario: Editing item notes from an item QR screen
- **WHEN** a user opens `/go/i/42`, activates the inline note editor, updates the note text (or clears it), and saves
- **THEN** the UI sends `PATCH /api/items/42` with the trimmed note (or `null` when cleared) and updates the displayed note immediately

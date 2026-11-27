# qr-quick-action Specification

## Purpose

Provides a dedicated, mobile-first QR Quick Action landing screen at `/go/:kind/:id` (`/go/i/:id`, `/go/p/:id`, `/go/l/:id`) so household members scanning printed QR codes with their phone camera can consume, open, transfer, restock, or add items to the shopping list in one tap without navigating dense management pages.

## Requirements

### Requirement: QR quick-action route resolution and error handling
The web application SHALL render a dedicated QR Quick Action screen at `/go/:kind/:id` for item (`i`), product (`p`), and location (`l`) QR links, resolving both integer IDs and `legacy_uuid` tokens (including merged product aliases for `p`) via `POST /api/scan/resolve`. When `:kind` is invalid or the target entity cannot be resolved, the screen SHALL display a clear not-found or invalid-link message with a direct link to the Inventory home view (`/`).

#### Scenario: Resolving an integer item QR link
- **WHEN** an authenticated user opens `/go/i/42`
- **THEN** the screen resolves item `42` and displays the Item Quick Action view for that item

#### Scenario: Resolving a legacy UUID item QR link
- **WHEN** an authenticated user opens `/go/i/<legacy-uuid>`
- **THEN** the screen resolves the item by `legacy_uuid` and displays the Item Quick Action view for that item

#### Scenario: Resolving a merged product QR link
- **WHEN** Product A (ID `12`) was merged into Product B (ID `4`) and an authenticated user opens `/go/p/12`
- **THEN** the screen resolves the merge alias and displays the Product Quick Action view for Product B

#### Scenario: Opening an unknown or invalid QR link
- **WHEN** an authenticated user opens `/go/i/999999` or `/go/x/123`
- **THEN** the screen displays a clear error state indicating the QR target was not found or is invalid, with a button to return to Inventory

### Requirement: Item QR quick actions
When viewing an in-stock item on `/go/i/:id`, the screen SHALL display the item's product name, variant (if present), current location, due date (with overdue or due-soon visual indicator), opened status, and notes, and SHALL provide prominent one-tap actions to:
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

### Requirement: Product QR quick actions
When viewing a product on `/go/p/:id`, the screen SHALL display the product's name, category, in-stock count, and shopping list status, and SHALL list all in-stock items ordered by soonest `due_on_date` (FIFO). The screen SHALL provide:
- When at least one in-stock item exists: a prominent **Consume Next** one-tap action targeting the soonest-due item (with **Undo**), plus per-item **Consume**, **Open** (when unopened), and **Transfer** (via location picker) actions with inline **Undo** for consume/open
- A **Quick Add (+1)** restock action (`POST /api/items` with quantity `1`, the product's default location, and calculated/default due date) so household members can quickly log a newly bought unit (especially when stock is `0`)
- A **Shopping List** toggle (`POST /api/products/:id/toggle-shopping-list`)
- A link to the full product detail page (`/products/:id`)

#### Scenario: One-tap Consume Next on a product with multiple in-stock items
- **WHEN** a user opens `/go/p/5` for a product with two in-stock items due `2026-12-01` and `2026-12-15` and taps **Consume Next**
- **THEN** the system consumes the `2026-12-01` item, decrements the displayed in-stock count, and displays an **Undo** button that restores the consumed item

#### Scenario: Transferring a specific item from a product QR screen
- **WHEN** a user opens `/go/p/5`, taps **Transfer** on an in-stock item row, picks a destination location, and confirms
- **THEN** the item is transferred via `POST /api/items/:id/transfer` and the list updates with its new location and due date

#### Scenario: Restocking an out-of-stock product from its QR screen
- **WHEN** a user opens `/go/p/5` for a product with `0` in-stock items and taps **Quick Add (+1)**
- **THEN** the system creates one new item in the product's default location with its calculated/default due date and displays it in the in-stock list

### Requirement: Location QR quick actions
When viewing a location on `/go/l/:id`, the screen SHALL display the location's `hierarchy_name`, freezer badge (if `is_freezer` is true), and in-stock item count, and SHALL list all in-stock items currently stored in that location ordered by soonest `due_on_date`. The screen SHALL provide:
- One-tap **Consume** on each item row with an inline **Undo** toast/banner so accidental taps can be immediately reversed
- One-tap **Open** (when unopened) and **Transfer** (via hierarchical location picker) actions on each item row
- A quick text filter input when the location contains multiple items (e.g., more than 5 items) to filter items by product or variant name
- Clickable **Sub-locations** links (`/go/l/:childId`) when the location has direct child locations, so scanning a parent location allows drilling into child shelves/drawers without leaving the QR flow
- A link to the full location detail page (`/locations/:id`)

#### Scenario: Consuming an item directly from a location QR screen with undo
- **WHEN** a user opens `/go/l/3` and taps **Consume** on an item row
- **THEN** the item is marked consumed, removed from the location's in-stock list, and an **Undo** banner is shown that restores the item to the list when clicked

#### Scenario: Transferring an item out of a location QR screen
- **WHEN** a user opens `/go/l/3` (e.g., Freezer), taps **Transfer** on an item row, selects `Kitchen > Fridge`, and confirms
- **THEN** the item is transferred to `Kitchen > Fridge` (applying thaw due-date rules) and removed from `/go/l/3`'s in-stock list

#### Scenario: Filtering items in a populated location
- **WHEN** a user opens `/go/l/3` containing more than 5 items and types `"milk"` in the filter input
- **THEN** only items whose product or variant name matches `"milk"` (case-insensitive) are shown

#### Scenario: Navigating into a sub-location from a parent location QR screen
- **WHEN** a user opens `/go/l/3` (`Freezer`) which has child locations `Top Drawer` and `Bottom Drawer`
- **THEN** clickable sub-location chips for `Top Drawer` (`/go/l/<topId>`) and `Bottom Drawer` (`/go/l/<bottomId>`) are displayed

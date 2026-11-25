## MODIFIED Requirements

### Requirement: Consume and Open workflows with continuous scan and undo
In `Consume` or `Open` mode, scanning an in-stock `Item` QR (`/go/i/:id`) SHALL immediately consume or open the item with continuous scanning, duplicate-scan debounce, and a temporary Undo toast. In `Consume` mode, each scan SHALL trigger a brief visual flash alongside the audio beep. Scanning an already-consumed `Item` QR or UUID SHALL NOT overwrite `consumed_on_date` and SHALL display an already-consumed notice naming the item. Scanning a `Product`, `Barcode`, or `Location` SHALL list unconsumed items ordered by soonest `due_on_date`. Typing a non-barcode product search query SHALL search in-stock products; if multiple in-stock products match, the UI SHALL display a clickable `Matching Products` list (showing each product's name and category) so selecting a product loads its unconsumed items into the item selection list; if exactly one in-stock product matches, the UI SHALL load its unconsumed items directly; if none match, the UI SHALL display a clear no-match status message.

#### Scenario: Continuous item scan with undo
- **WHEN** a user scans `/go/i/<uuid>` for an unconsumed item in Consume mode and taps Undo on the confirmation toast
- **THEN** the item's `consumed_on_date` is cleared and the item returns to available stock

#### Scenario: Visual flash accompanies beep on Consume scan
- **WHEN** a user scans a barcode or QR code in Consume mode
- **THEN** a brief visual flash is triggered simultaneously with the scan beep (visible over the live camera viewfinder when enabled and on the scanner bar) and automatically clears after a short duration without blocking subsequent scans

#### Scenario: Scanning an already-consumed item displays already-consumed message with item name
- **WHEN** a user scans `/go/i/<id>` (or item UUID) in Consume mode for an item (e.g., `"Milk, Whole"`) that already has `consumed_on_date` set
- **THEN** the system does not overwrite the item's `consumed_on_date`, does not display a "Consumed" undo toast, and displays a message containing `"Milk, Whole"` stating that it was already consumed

#### Scenario: Unknown barcode in Consume mode
- **WHEN** a user scans an unrecognized retail barcode in Consume mode
- **THEN** the UI offers inline association of that barcode to an existing product without leaving the workflow

#### Scenario: Searching by product name with multiple matching in-stock products
- **WHEN** a user types a product name query (e.g., `"Bagel"`) in `Consume` or `Open` mode that matches multiple in-stock products
- **THEN** the UI displays a clickable `Matching Products` list showing up to 8 matching products with their category names, and clicking a product clears the matching-products list and loads that product's unconsumed items into the item selection list (with the soonest-due item pre-selected)

#### Scenario: Searching by product name with a single matching in-stock product
- **WHEN** a user types a product name query in `Consume` or `Open` mode that matches exactly one in-stock product
- **THEN** the UI directly loads that product's unconsumed items into the item selection list without requiring an extra product-picker click

#### Scenario: Searching by product name with no matching in-stock products
- **WHEN** a user types a product name query in `Consume` or `Open` mode that matches zero in-stock products
- **THEN** the UI displays a status message indicating no matching in-stock products were found and does not show a product-creation form

### Requirement: Transfer workflow
In `Transfer` mode, the user SHALL scan one or more `Item` QRs, `Product` QRs, or retail UPCs—or search for in-stock products by typing a product name—to stage in-stock items in a visible transfer list, then complete the transfer by scanning or keying in/selecting a destination `Location`. Scanning a `Product` QR SHALL list all in-stock items of that product for multi-select staging, and scanning a UPC SHALL list all in-stock items of that variant for multi-select staging. Typing a non-barcode product search query SHALL search in-stock products; if multiple in-stock products match, the UI SHALL display a clickable `Matching Products` list so selecting a product lists all of its in-stock items for multi-select staging; if exactly one in-stock product matches, the UI SHALL load its in-stock items directly for multi-select staging; if none match, the UI SHALL display a clear no-match status message. Completing the transfer SHALL move all staged items, apply freeze/thaw due-date rules, and clear the list.

#### Scenario: Batch transfer into a freezer location
- **WHEN** a user in Transfer mode scans two in-stock item QRs and then scans a destination location QR with `is_freezer=true`
- **THEN** both items appear in the visible transfer list as they are scanned, and scanning the location QR transfers both items to that location, applies `default_due_days_on_freeze` if configured, clears the transfer list, and displays a confirmation message

#### Scenario: Completing transfer by keying in or selecting a destination location
- **WHEN** a user in Transfer mode has one or more items in the visible transfer list, keys in or selects a destination location in the location selector, and confirms the transfer
- **THEN** all staged items are transferred to the selected destination location, the transfer list is cleared, and a confirmation message is displayed

#### Scenario: Scanning a product QR lists all in-stock items of that product for selection
- **WHEN** a user in Transfer mode scans a product QR (`/go/p/:id`) for a product with multiple in-stock items across variants or locations
- **THEN** the UI displays all in-stock items of that product and lets the user select one or more items to add to the visible transfer list without immediately executing the transfer

#### Scenario: Scanning a retail UPC lists all in-stock items of that variant for selection
- **WHEN** a user in Transfer mode scans a retail UPC associated with Variant A of a product that has in-stock items in both Variant A and Variant B
- **THEN** the UI displays only the in-stock items belonging to Variant A and lets the user select one or more of those items to add to the visible transfer list

#### Scenario: Removing a staged item before completing transfer
- **WHEN** a user removes an item from the visible transfer list and then completes the transfer to a destination location
- **THEN** only the remaining staged items are transferred to the destination location

#### Scenario: Scanning an already-consumed item in Transfer mode displays already-consumed notice
- **WHEN** a user in Transfer mode scans an item QR for an item (e.g., `"Milk, Whole"`) that already has `consumed_on_date` set
- **THEN** the item is not added to the transfer list and the UI displays a message containing `"Milk, Whole"` stating that it was already consumed

#### Scenario: Scanning a location QR with an empty transfer list prompts to scan items first
- **WHEN** a user in Transfer mode scans a destination location QR before any items are in the transfer list
- **THEN** no transfer is executed and the UI prompts the user to scan one or more items first

#### Scenario: Searching by product name with multiple matching in-stock products in Transfer mode
- **WHEN** a user types a product name query in `Transfer` mode that matches multiple in-stock products
- **THEN** the UI displays a clickable `Matching Products` list showing up to 8 matching products with their category names, and clicking a product clears the matching-products list and lists that product's in-stock items for multi-select staging into the transfer list (pre-selecting the first unstaged item)

#### Scenario: Searching by product name with a single matching in-stock product in Transfer mode
- **WHEN** a user types a product name query in `Transfer` mode that matches exactly one in-stock product
- **THEN** the UI directly lists that product's in-stock items for multi-select staging into the transfer list (pre-selecting the first unstaged item)

#### Scenario: Searching by product name with no matching in-stock products in Transfer mode
- **WHEN** a user types a product name query in `Transfer` mode that matches zero in-stock products
- **THEN** the UI displays a status message indicating no matching in-stock products were found

#### Scenario: Scanning an unrecognized numeric barcode in Transfer mode
- **WHEN** a user scans an unrecognized 6–14 digit retail barcode in `Transfer` mode
- **THEN** the UI displays `"Unrecognized barcode or QR code."` instead of performing a product-name text search

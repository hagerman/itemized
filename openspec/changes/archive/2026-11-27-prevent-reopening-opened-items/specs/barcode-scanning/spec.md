# Spec Delta

## MODIFIED Requirements

### Requirement: Consume and Open workflows with continuous scan and undo
In `Consume` or `Open` mode, scanning an in-stock `Item` QR (`/go/i/:id`) SHALL immediately consume or open the item with continuous scanning, duplicate-scan debounce, and a temporary Undo toast. In `Consume` mode, each scan SHALL trigger a brief visual flash alongside the audio beep. Scanning an already-consumed `Item` QR or UUID SHALL NOT overwrite `consumed_on_date` and SHALL display an already-consumed notice naming the item. In `Open` mode, scanning an already-opened `Item` QR or UUID SHALL NOT overwrite `opened_on_date`, SHALL NOT display an "Opened" undo toast, and SHALL display an error message naming the item and its opened date. Scanning a `Product`, `Barcode`, or `Location` SHALL list unconsumed items ordered by soonest `due_on_date` in `Consume` mode, and SHALL list only unopened unconsumed items ordered by soonest `due_on_date` in `Open` mode (displaying an already-opened error message when in-stock items exist but all of them are already opened). Typing a non-barcode product search query SHALL search in-stock products; if multiple in-stock products match, the UI SHALL display a clickable `Matching Products` list (showing each product's name and category) so selecting a product loads its eligible unconsumed items (unopened only in `Open` mode, or an already-opened error if all in-stock items are already opened) into the item selection list; if exactly one in-stock product matches, the UI SHALL load its eligible items directly; if none match, the UI SHALL display a clear no-match status message.

#### Scenario: Continuous item scan with undo
- **WHEN** a user scans `/go/i/<uuid>` for an unconsumed item in Consume mode and taps Undo on the confirmation toast
- **THEN** the item's `consumed_on_date` is cleared and the item returns to available stock

#### Scenario: Visual flash accompanies beep on Consume scan
- **WHEN** a user scans a barcode or QR code in Consume mode
- **THEN** a brief visual flash is triggered simultaneously with the scan beep (visible over the live camera viewfinder when enabled and on the scanner bar) and automatically clears after a short duration without blocking subsequent scans

#### Scenario: Scanning an already-consumed item displays already-consumed message with item name
- **WHEN** a user scans `/go/i/<id>` (or item UUID) in Consume mode for an item (e.g., `"Milk, Whole"`) that already has `consumed_on_date` set
- **THEN** the system does not overwrite the item's `consumed_on_date`, does not display a "Consumed" undo toast, and displays a message containing `"Milk, Whole"` stating that it was already consumed

#### Scenario: Scanning an already-opened item in Open mode displays already-opened error with item name
- **WHEN** a user scans `/go/i/<id>` (or item UUID) in `Open` mode for an item (e.g., `"Beans, Black"`) that already has `opened_on_date` set (e.g., `"2026-11-28"`)
- **THEN** the system does not overwrite the item's `opened_on_date`, does not display an "Opened" undo toast, and displays an error message containing `"Beans, Black"` and `"2026-11-28"` stating that it was already opened

#### Scenario: Scanning a product or barcode in Open mode when all in-stock items are already opened
- **WHEN** a user in `Open` mode scans a product QR, scans a retail barcode, or selects a product from search whose in-stock items all already have `opened_on_date` set
- **THEN** the UI does not show an item selection list and displays an error message stating that the product's in-stock item(s) were already opened

#### Scenario: Scanning a product or barcode in Open mode filters out already-opened items
- **WHEN** a user in `Open` mode scans a product QR, scans a retail barcode, or selects a product from search that has both already-opened and unopened in-stock items
- **THEN** the UI lists only the unopened in-stock items (ordered by soonest `due_on_date`, with the soonest-due unopened item pre-selected)

#### Scenario: Unknown barcode in Consume mode
- **WHEN** a user scans an unrecognized retail barcode in Consume mode
- **THEN** the UI offers inline association of that barcode to an existing product without leaving the workflow

#### Scenario: Searching by product name with multiple matching in-stock products
- **WHEN** a user types a product name query (e.g., `"Bagel"`) in `Consume` or `Open` mode that matches multiple in-stock products
- **THEN** the UI displays a clickable `Matching Products` list showing up to 8 matching products with their category names, and clicking a product clears the matching-products list and loads that product's eligible unconsumed items (unopened only in `Open` mode) into the item selection list (with the soonest-due eligible item pre-selected)

#### Scenario: Searching by product name with a single matching in-stock product
- **WHEN** a user types a product name query in `Consume` or `Open` mode that matches exactly one in-stock product
- **THEN** the UI directly loads that product's eligible unconsumed items into the item selection list without requiring an extra product-picker click

#### Scenario: Searching by product name with no matching in-stock products
- **WHEN** a user types a product name query in `Consume` or `Open` mode that matches zero in-stock products
- **THEN** the UI displays a status message indicating no matching in-stock products were found and does not show a product-creation form

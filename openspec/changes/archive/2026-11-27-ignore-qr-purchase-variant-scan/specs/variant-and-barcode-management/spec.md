# Spec Delta

## MODIFIED Requirements

### Requirement: Paired barcode and quantity rows with scan-to-fill button
In both the Purchase workflow's Variant & Barcode Details section and the `/products/:id` Add Barcode form, each barcode input SHALL appear on the same horizontal row as its corresponding pack quantity input, and SHALL include a scan button that captures a barcode scan directly into that input field. When live camera scanning is opened from a variant's Add Barcode scan button on `/products/:id`, the scanner SHALL ignore QR codes and decode only 1D retail barcode formats so QR codes printed next to a product's UPC do not populate the variant barcode input.

#### Scenario: Purchase screen pairs each barcode with its pack quantity
- **WHEN** a user expands Variant & Barcode Details in the Purchase workflow
- **THEN** the variant name appears on its own row, the primary barcode input sits on the same row as the primary pack quantity input (with a scan button), and the optional second barcode input sits on the same row as the second pack quantity input (with a scan button)

#### Scenario: Scanning fills the targeted barcode input
- **WHEN** a user clicks the scan button next to a barcode input (primary barcode, second barcode, or variant add-barcode) and scans a barcode
- **THEN** the scanned value populates that specific barcode input without triggering a new workflow lookup

#### Scenario: Variant barcode scan modal ignores QR codes
- **WHEN** a user opens the scan modal for a variant's barcode input on `/products/:id` and enables the live camera with a QR code and a retail UPC in view
- **THEN** the camera decoder excludes QR code formats so the QR code is ignored and only 1D retail barcodes populate the variant barcode input

# Spec Delta

## Purpose

Enables creating, editing, and deleting product variants and their associated barcodes directly from `/products/:id`, and aligns barcode + pack quantity inputs onto a single row with scan-to-fill buttons across both `/products/:id` and the Purchase workflow.

## ADDED Requirements

### Requirement: Inline variant CRUD on the product detail page
On `/products/:id`, users SHALL be able to create a new variant, edit an existing variant's name (and optional measurement value/unit), and delete a variant without leaving the product page.

#### Scenario: Editing an existing variant
- **WHEN** a user clicks Edit on a variant card on `/products/:id`, changes the variant name, and saves
- **THEN** the system persists the change via `PATCH /api/variants/:id` and refreshes the variant display

#### Scenario: Creating and deleting a variant
- **WHEN** a user adds a new variant on `/products/:id`
- **THEN** the system persists it via `POST /api/products/:id/variants` and displays the new variant card
- **AND** deleting a variant removes it via `DELETE /api/variants/:id`

### Requirement: Inline barcode management on variants
On each variant card on `/products/:id`, users SHALL be able to add a barcode (specifying the barcode value and its pack quantity on the same row) and remove an existing barcode.

#### Scenario: Adding and deleting a barcode on a variant
- **WHEN** a user enters a barcode and pack quantity on a variant card and clicks Add
- **THEN** the system persists it via `POST /api/variants/:id/barcodes` and displays the barcode badge with a remove button
- **AND** if the barcode already exists (HTTP 409), the UI displays a clear error message

### Requirement: Paired barcode and quantity rows with scan-to-fill button
In both the Purchase workflow's Variant & Barcode Details section and the `/products/:id` Add Barcode form, each barcode input SHALL appear on the same horizontal row as its corresponding pack quantity input, and SHALL include a scan button that captures a barcode scan directly into that input field.

#### Scenario: Purchase screen pairs each barcode with its pack quantity
- **WHEN** a user expands Variant & Barcode Details in the Purchase workflow
- **THEN** the variant name appears on its own row, the primary barcode input sits on the same row as the primary pack quantity input (with a scan button), and the optional second barcode input sits on the same row as the second pack quantity input (with a scan button)

#### Scenario: Scanning fills the targeted barcode input
- **WHEN** a user clicks the scan button next to a barcode input (primary barcode, second barcode, or variant add-barcode) and scans a barcode
- **THEN** the scanned value populates that specific barcode input without triggering a new workflow lookup

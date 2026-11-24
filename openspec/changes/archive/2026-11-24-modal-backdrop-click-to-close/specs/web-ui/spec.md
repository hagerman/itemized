# Spec Delta

## ADDED Requirements

### Requirement: Modal dialog backdrop dismissal
Every modal dialog in the web application (including the Scanner modal, Barcode Scan modal, Quick Search dialog, and Keyboard Shortcuts help dialog) SHALL close when the user clicks or taps the backdrop area outside the dialog panel, and SHALL remain open when the user interacts with elements inside the dialog panel or finishes a pointer drag on the backdrop that started inside the dialog panel.

#### Scenario: Clicking outside a modal dialog closes it
- **WHEN** a modal dialog (Scanner, Barcode Scan, Quick Search, or Keyboard Shortcuts) is open and the user clicks or taps the darkened backdrop outside the dialog panel
- **THEN** the modal dialog closes (triggering the same close behavior as its close button)

#### Scenario: Clicking inside a modal dialog does not close it
- **WHEN** a modal dialog is open and the user clicks or taps inside the dialog panel (including its header, body, form inputs, or non-closing controls)
- **THEN** the modal dialog remains open

#### Scenario: Dragging from inside a modal dialog onto the backdrop does not close it
- **WHEN** a modal dialog is open and the user presses the pointer inside the dialog panel (for example, to select text in an input) and releases it on the backdrop outside the dialog panel
- **THEN** the modal dialog remains open

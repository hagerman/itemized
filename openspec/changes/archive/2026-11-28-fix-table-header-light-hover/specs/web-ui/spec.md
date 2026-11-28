# Spec Delta

## ADDED Requirements

### Requirement: Desktop table column header hover contrast
All sortable column header buttons in the desktop Products table (`Product`, `Category`, `Location`, `Stock`, `Next Due`, and `Shopping List`) SHALL maintain legible foreground contrast against the table surface on hover in both light mode and dark mode, using a dark foreground hover color in light mode (`hover:text-slate-900`) and a light foreground hover color in dark mode (`dark:hover:text-white`) rather than a light-only `hover:text-white` class.

#### Scenario: Hovering a sortable table column header in light mode keeps the header visible
- **WHEN** a user views an inventory list page on a desktop viewport in light mode and hovers over any sortable column header button (`Product`, `Category`, `Location`, `Stock`, `Next Due`, or `Shopping List`)
- **THEN** the column header label and sort icon transition to a dark high-contrast hover color (`hover:text-slate-900`) against the light table background instead of turning white and disappearing

#### Scenario: Hovering a sortable table column header in dark mode preserves light hover contrast
- **WHEN** a user views an inventory list page on a desktop viewport in dark mode and hovers over any sortable column header button (`Product`, `Category`, `Location`, `Stock`, `Next Due`, or `Shopping List`)
- **THEN** the column header label and sort icon transition to white (`dark:hover:text-white`) against the dark table background

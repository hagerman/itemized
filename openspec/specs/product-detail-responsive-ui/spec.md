# product-detail-responsive-ui Specification

## Purpose

Ensures the `/products/:id` detail page renders cleanly across mobile and desktop viewports with single-row header actions and zero horizontal table overflow for items in stock.

## Requirements

### Requirement: Single-row responsive product header actions
On `/products/:id`, the top action controls (`Add to List` / `On List`, `Print Label`, `Edit`, `Delete`) SHALL stay on a single horizontal row without wrapping onto a second line on mobile viewports by collapsing text labels to icon-only buttons with accessible `aria-label` and `title` attributes when space is constrained, while showing icon + text labels on wider viewports.

#### Scenario: Narrow mobile viewport keeps actions on one row
- **WHEN** a user opens `/products/:id` on a mobile viewport
- **THEN** all four header actions render as compact icon buttons on one row without wrapping, and each button has an accessible label describing its action

### Requirement: Responsive Items in Stock presentation without horizontal scrolling
The `Items in Stock` section on `/products/:id` SHALL render each item as a self-contained vertical card on mobile viewports (displaying selection checkbox, item ID, location, purchased/opened/due dates, and full-width single-row `Open`, `Consume`, and `Print` action buttons) with zero horizontal scrolling, and SHALL render the full multi-column table with non-wrapping action buttons on desktop viewports.

#### Scenario: Viewing and acting on items on mobile
- **WHEN** a user views `Items in Stock` on a mobile viewport
- **THEN** each item renders in a stacked card with all metadata and `Open`, `Consume`, and `Print` buttons fitting cleanly within the viewport width without horizontal overflow
- **AND** selecting item checkboxes still activates the bulk action bar

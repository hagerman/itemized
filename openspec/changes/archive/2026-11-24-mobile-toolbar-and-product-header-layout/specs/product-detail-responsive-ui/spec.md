# Spec Delta

## MODIFIED Requirements

### Requirement: Single-row responsive product header actions
On `/products/:id`, the top action controls (`Add to List` / `On List`, `Print Label`, `Edit`, `Delete`) SHALL be right-aligned and stay together on a single horizontal row (collapsing text labels to accessible icon-only buttons on mobile, and showing icon + text labels on wider viewports), sharing the same line as the back button and product title whenever they fit and wrapping right-aligned onto a second row when constrained.

#### Scenario: Narrow mobile viewport keeps actions on one row
- **WHEN** a user opens `/products/:id` on a mobile viewport
- **THEN** all four header actions render as compact, right-aligned icon buttons on one row without wrapping amongst themselves, and each button has an accessible label describing its action

#### Scenario: Narrow mobile viewport with short title fits header actions on the same line
- **WHEN** a user opens `/products/:id` on a mobile viewport and the back button, product title/subtitle, and four compact icon action buttons fit within the available header width
- **THEN** all four action buttons render on the same horizontal line as the title, aligned to the right edge of the header

#### Scenario: Narrow mobile viewport with long title wraps header actions right-aligned
- **WHEN** a user opens `/products/:id` on a mobile viewport and the product title or category/location subtitle is too wide to share a line with the four action buttons
- **THEN** the four action buttons wrap together onto a single right-aligned row below the title without horizontal overflow

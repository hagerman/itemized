# Spec Delta

## ADDED Requirements

### Requirement: iOS and mobile form control layout and dark-mode styling
Form controls in multi-column responsive grids—including native `<input type="date">` and `<select>` controls—SHALL stay within their assigned column bounds without overflowing adjacent controls on iOS, maintain consistent heights across adjacent fields, and declare dark `color-scheme` styling for legible native chrome.

#### Scenario: Due Date does not overlap Label Mode in the Purchase form on iOS
- **WHEN** a user opens the `Scan & Action` Purchase form on an iOS mobile viewport (whether `Due Date` is empty or populated)
- **THEN** the `Due Date` input stays strictly within its left grid column (`min-width: 0`, `max-width: 100%`) without extending behind the adjacent `Label Mode` selector

#### Scenario: Adjacent Purchase form controls align vertically with consistent height
- **WHEN** a user views the `Quantity`, `Location`, `Due Date`, and `Label Mode` grid in the `Scan & Action` Purchase form on iOS or desktop
- **THEN** all four controls render with uniform height and aligned baselines without vertical collapse when `Due Date` is empty

#### Scenario: Native form chrome respects dark theme contrast
- **WHEN** a user views native `<select>` or `<input type="date">` controls across the web application on iOS or desktop
- **THEN** the root document declares `color-scheme: dark` so native select chevrons, calendar icons, and picker sheets render with dark-theme contrast

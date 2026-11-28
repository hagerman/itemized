# Spec Delta

## ADDED Requirements

### Requirement: Quick consume action with undo toast on inventory list
When `quick_actions_enabled` is enabled (default `true`) and `in_stock_count > 0`, the Products list SHALL show an explicit `Consume` button on mobile cards (footer row) and in a trailing action column on desktop rows (keeping `Stock` count-only). Activating `Consume` SHALL call `POST /api/products/{id}/consume-next` without navigating, refresh counts, and show an Undo toast backed by `PATCH /api/items/{id}`.

#### Scenario: Quick consuming a product from mobile card or desktop row
- **WHEN** a user with `quick_actions_enabled: true` clicks `Consume` on an in-stock product in the inventory list
- **THEN** the browser remains on the inventory list (does not navigate to `/products/:id`), calls `POST /api/products/{id}/consume-next`, refreshes the product list and sidebar counts, and displays a toast naming the consumed product (and location when present) with an `Undo` button

#### Scenario: Undoing a quick consume restores the item
- **WHEN** a user clicks `Undo` on the quick-consume toast
- **THEN** the application calls `PATCH /api/items/{id}` with `{"consumed_on_date": null}`, refreshes the product list and sidebar counts, and dismisses the toast

#### Scenario: Out-of-stock products do not show quick consume
- **WHEN** a product in the inventory list (such as in `All Items` or `Shopping List`) has `in_stock_count === 0`
- **THEN** no `Consume` button is rendered for that product

#### Scenario: Disabling quick actions hides quick-consume buttons and column
- **WHEN** the signed-in user has `quick_actions_enabled: false`
- **THEN** `Consume` buttons are hidden across mobile product cards and the trailing action column is omitted from the desktop table

### Requirement: Quick actions preference toggle in Account settings
The Settings page (for all roles) SHALL provide a `Quick Actions` preference styled cohesively with `Appearance`—bold heading, concise description noting label-printing power users, and an `Enabled | Disabled` segmented `radiogroup` initialized from `user.quick_actions_enabled`. Changing it SHALL persist via `PATCH /api/auth/account` (or update locally in demo mode) and immediately reflect on the inventory list.

#### Scenario: User disables quick actions in Settings
- **WHEN** an authenticated user selects `Disabled` in the `Quick Actions` segmented control in Settings
- **THEN** the application sends `PATCH /api/auth/account` with `{"quick_actions_enabled": false}`, updates the cached auth status, and displays confirmation (reverting with an inline error if the request fails)

#### Scenario: Toggling quick actions in demo mode updates locally
- **WHEN** a visitor selects `Disabled` in the `Quick Actions` segmented control while running in demo mode
- **THEN** the application updates the cached user preference locally without calling `PATCH /api/auth/account`

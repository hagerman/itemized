# Spec Delta

## ADDED Requirements

### Requirement: Light and dark theme support with profile-backed preference
The web application SHALL support both light mode (matching the `itemizedapp.com` light color palette) and dark mode across all views, modals, drawers, forms, auth screens, and help prose. Theme mode SHALL default to `system` (reactively tracking OS `prefers-color-scheme: dark`), allow any authenticated user to select `System`, `Light`, or `Dark` in Settings saved to their profile (or previewed locally in demo mode), prevent flash of wrong theme on initial load, and keep `<meta name="theme-color">` synchronized with the active theme.

#### Scenario: Default system mode follows OS color scheme
- **WHEN** a user has `theme` set to `"system"` (or is unauthenticated with no stored override)
- **THEN** the application renders in light mode when the OS prefers light (`prefers-color-scheme: dark` is false) and in dark mode when the OS prefers dark (`prefers-color-scheme: dark` is true), and updates immediately if the OS color scheme changes while the app is open

#### Scenario: User selects Light or Dark mode in Settings and saves to profile
- **WHEN** an authenticated `member` or `admin` user opens `/settings` and selects `Light` (or `Dark` or `System`) in the Appearance / Theme selector
- **THEN** the application immediately applies the selected theme across the UI, updates `<meta name="theme-color">` and root `color-scheme`, and persists the preference via `PATCH /api/auth/account` with `{"theme": "<mode>"}` so subsequent sessions and devices load the saved preference

#### Scenario: Demo mode allows local theme preview without failing on disabled account mutations
- **WHEN** a user in demo mode opens `/settings` and selects `Light`, `Dark`, or `System`
- **THEN** the application immediately applies the selected theme locally in the browser without calling the disabled `PATCH /api/auth/account` endpoint or displaying an error

#### Scenario: Initial load avoids flash of wrong theme
- **WHEN** a user whose cached theme preference is `light` (or `system` on a light-mode OS) loads or refreshes the application
- **THEN** the document root initializes in light mode before React hydrates so the page does not flash dark chrome before switching to light

### Requirement: Neutral location-matched freezer indicator icon
Freezer location snowflake icons rendered in location lists, trees, and pickers (sidebar location tree, hierarchical location selector options, Locations management list, and Location QR sub-location chips) SHALL match the location pin icon color (`text-slate-400 dark:text-slate-500`, and `text-indigo-600 dark:text-indigo-400` when the location row is selected) instead of sky blue. Inside the inline `Create Freezer` action and `Freezer` pill badges, the snowflake icon SHALL inherit the surrounding control's font color (`currentColor`).

#### Scenario: Freezer snowflake icons in location lists match the location icon color
- **WHEN** a user views a location marked `is_freezer: true` in the sidebar Locations tree, `HierarchySelect` option list, `/locations` management list, or `/go/l/:id` sub-location chips
- **THEN** the freezer snowflake icon uses the muted location icon color (`text-slate-400 dark:text-slate-500`, or `text-indigo-600 dark:text-indigo-400` when that location row is selected) rather than sky blue (`text-sky-400`)

#### Scenario: Inline Create Freezer and Freezer badge icons match the label font color
- **WHEN** a user views the inline `Create Freezer` action in `HierarchySelect` or the `Freezer` badge on `/go/l/:id`
- **THEN** the snowflake icon inherits the control's text color (`currentColor`) without a separate icon color override

## MODIFIED Requirements

### Requirement: Responsive application shell and PWA support
The web application SHALL provide a responsive layout with a persistent desktop sidebar, a solid non-blurred top header bar, a mobile drawer and bottom action dock (`Inventory`, `Scan / Action`, `Search`) that highlights the active navigation tab (`Inventory` or `Search`), top and bottom safe-area inset handling, automatic iOS input-focus zoom prevention without disabling manual pinch-to-zoom, the custom box brand logo in navigation and auth screens, and an installable PWA manifest with iOS full-screen home-screen meta tags, favicons, and Apple Touch Icon assets.

#### Scenario: Mobile viewport displays bottom navigation dock
- **WHEN** a user opens the application on a mobile viewport
- **THEN** the sidebar collapses into a toggleable drawer and a bottom dock provides one-tap access to Inventory, Scan / Action, and Search

#### Scenario: Active tab highlighted in mobile bottom navigation dock
- **WHEN** a user views the Inventory route (`/`) or the Search route (`/search`) on a mobile viewport
- **THEN** the corresponding bottom dock tab (`Inventory` for `/`, `Search` for `/search`) is visually highlighted using a distinct foreground color (without changing its background color) and `aria-current="page"`, while inactive tabs remain in their default muted foreground style

#### Scenario: Non-dock routes leave Inventory and Search tabs unhighlighted
- **WHEN** a user views a route outside Inventory and Search (such as `/settings`, `/categories`, or `/locations`) on a mobile viewport
- **THEN** neither the `Inventory` tab nor the `Search` tab in the mobile bottom dock is highlighted as active

#### Scenario: Top header renders without backdrop blur on iOS
- **WHEN** a user views any page of the application on iOS Safari or in standalone PWA mode
- **THEN** the top `<header>` renders with a solid opaque background matching the active theme (`bg-white` in light mode, `dark:bg-slate-900` in dark mode) and no `backdrop-blur` (`backdrop-filter`) so the navigation menu icon and page title remain crisp without iOS top-edge blur artifacts

#### Scenario: Desktop viewport displays persistent sidebar
- **WHEN** a user opens the application on a desktop viewport
- **THEN** the navigation sidebar remains visible alongside the main content area and the mobile bottom dock is hidden

#### Scenario: Brand logo displayed in navigation and auth screens
- **WHEN** a user views the application sidebar or the login/setup screen
- **THEN** the custom minimal box brand logo is rendered alongside the `itemized` wordmark instead of the generic box icon

#### Scenario: Favicon and PWA icons configured for browser and home-screen install
- **WHEN** a browser loads the application or installs it as a PWA on desktop, iOS, or Android
- **THEN** `index.html` links the custom SVG/PNG favicons and `apple-touch-icon` (`/apple-touch-icon.png`), declares iOS/mobile standalone full-screen meta tags (`apple-mobile-web-app-capable`, `mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style`, `apple-mobile-web-app-title`, and `viewport-fit=cover`), and `manifest.json` declares `192x192`, `512x512`, and maskable `512x512` PNG icons matching the custom brand logo

#### Scenario: Focusing a text input on iOS does not trigger automatic page zoom
- **WHEN** a user on iOS focuses any `<input>`, `<textarea>`, or `<select>` control in the application (such as Quick Search, mobile Search, scanner input, auth fields, or product forms)
- **THEN** the control renders with a font size of at least `16px` so iOS Safari and standalone web apps do not automatically zoom the viewport or push navigation items off-screen, while preserving user pinch-to-zoom accessibility

#### Scenario: Standalone iOS full-screen layout respects top safe-area inset
- **WHEN** the application runs as an added-to-home-screen full-screen app on an iOS device with a status bar notch or Dynamic Island
- **THEN** the top header and slide-out navigation drawer include top safe-area inset padding (`env(safe-area-inset-top)`) and the shell uses dynamic viewport height (`100dvh`) so navigation controls remain unobstructed

#### Scenario: Standalone iOS full-screen layout respects bottom safe-area inset without compressing the bottom dock
- **WHEN** the application runs as an added-to-home-screen full-screen app on an iOS device with a home indicator (`env(safe-area-inset-bottom) > 0`)
- **THEN** the mobile bottom navigation dock expands its total height by `env(safe-area-inset-bottom)` (`calc(4rem + env(safe-area-inset-bottom))`) alongside `pb-[env(safe-area-inset-bottom)]` so its `Inventory`, `Scan / Action`, and `Search` buttons retain a full `4rem` height without vertical squishing or clipping, and the mobile navigation drawer footer includes bottom safe-area inset padding so account controls remain clear of the home indicator

### Requirement: iOS and mobile form control layout and dark-mode styling
Form controls in multi-column responsive grids—including native `<input type="date">` and `<select>` controls—SHALL stay within their assigned column bounds on iOS, maintain consistent heights across adjacent fields, and declare `color-scheme` matching the active theme (`light` in light mode, `dark` in dark mode). In the Purchase form, `Label Mode` SHALL be shown only when `printers_enabled` is `true` and omitted otherwise without empty trailing columns.

#### Scenario: Due Date does not overlap Label Mode in the Purchase form on iOS
- **WHEN** `printers_enabled` is `true` and a user opens the `Scan & Action` Purchase form on an iOS mobile viewport (whether `Due Date` is empty or populated)
- **THEN** the `Due Date` input stays strictly within its left grid column (`min-width: 0`, `max-width: 100%`) without extending behind the adjacent `Label Mode` selector

#### Scenario: Adjacent Purchase form controls align vertically with consistent height
- **WHEN** a user views the `Quantity`, `Location`, `Due Date`, and (when `printers_enabled` is `true`) `Label Mode` grid in the `Scan & Action` Purchase form on iOS or desktop
- **THEN** all visible controls render with uniform height and aligned baselines without vertical collapse when `Due Date` is empty

#### Scenario: Purchase form omits Label Mode when no printers are configured
- **WHEN** `printers_enabled` is `false` and a user opens the `Scan & Action` Purchase form
- **THEN** the `Label Mode` selector is not rendered and the remaining `Quantity`, `Location`, and `Due Date` controls render cleanly without an empty trailing column on desktop

#### Scenario: Native form chrome respects dark theme contrast
- **WHEN** a user views native `<select>` or `<input type="date">` controls across the web application on iOS or desktop while dark mode is active
- **THEN** the root document declares `color-scheme: dark` so native select chevrons, calendar icons, and picker sheets render with dark-theme contrast

#### Scenario: Native form chrome respects light theme contrast
- **WHEN** a user views native `<select>` or `<input type="date">` controls across the web application on iOS or desktop while light mode is active
- **THEN** the root document declares `color-scheme: light` so native select chevrons, calendar icons, and picker sheets render with light-theme contrast

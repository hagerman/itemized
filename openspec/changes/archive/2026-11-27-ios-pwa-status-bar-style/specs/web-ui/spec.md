# Spec Delta

## MODIFIED Requirements

### Requirement: Responsive application shell and PWA support
The web application SHALL provide a responsive layout with a persistent desktop sidebar, a solid non-blurred top header bar, a mobile drawer and bottom action dock (`Inventory`, `Scan / Action`, `Search`) that highlights the active navigation tab (`Inventory` or `Search`), top and bottom safe-area inset handling, automatic iOS input-focus zoom prevention without disabling manual pinch-to-zoom, the custom box brand logo in navigation and auth screens, and an installable PWA manifest with iOS full-screen home-screen meta tags (using `apple-mobile-web-app-status-bar-style` set to `default` rather than `black-translucent`), favicons, and Apple Touch Icon assets.

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
- **THEN** `index.html` links the custom SVG/PNG favicons and `apple-touch-icon` (`/apple-touch-icon.png`), declares iOS/mobile standalone full-screen meta tags (`apple-mobile-web-app-capable`, `mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style` set to `default` so iOS does not composite a translucent status-bar blur overlay over the top of the app, `apple-mobile-web-app-title`, and `viewport-fit=cover`), and `manifest.json` declares `192x192`, `512x512`, and maskable `512x512` PNG icons matching the custom brand logo

#### Scenario: Focusing a text input on iOS does not trigger automatic page zoom
- **WHEN** a user on iOS focuses any `<input>`, `<textarea>`, or `<select>` control in the application (such as Quick Search, mobile Search, scanner input, auth fields, or product forms)
- **THEN** the control renders with a font size of at least `16px` so iOS Safari and standalone web apps do not automatically zoom the viewport or push navigation items off-screen, while preserving user pinch-to-zoom accessibility

#### Scenario: Standalone iOS full-screen layout respects top safe-area inset
- **WHEN** the application runs as an added-to-home-screen full-screen app on an iOS device with a status bar notch or Dynamic Island
- **THEN** the top header and slide-out navigation drawer include top safe-area inset padding (`env(safe-area-inset-top)`) and the shell uses dynamic viewport height (`100dvh`) so navigation controls remain unobstructed

#### Scenario: Standalone iOS full-screen layout respects bottom safe-area inset without compressing the bottom dock
- **WHEN** the application runs as an added-to-home-screen full-screen app on an iOS device with a home indicator (`env(safe-area-inset-bottom) > 0`)
- **THEN** the mobile bottom navigation dock expands its total height by `env(safe-area-inset-bottom)` (`calc(4rem + env(safe-area-inset-bottom))`) alongside `pb-[env(safe-area-inset-bottom)]` so its `Inventory`, `Scan / Action`, and `Search` buttons retain a full `4rem` height without vertical squishing or clipping, and the mobile navigation drawer footer includes bottom safe-area inset padding so account controls remain clear of the home indicator

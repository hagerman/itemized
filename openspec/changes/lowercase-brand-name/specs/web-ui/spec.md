# Spec Delta

## ADDED Requirements

### Requirement: Brand name capitalization
The web application SHALL render the brand name in lowercase as `itemized` everywhere—including the browser `<title>`, PWA manifest (`name` and `short_name`), iOS `apple-mobile-web-app-title`, navigation wordmark, loading states, error messages, and UI copy—except when `Itemized` is the first word of a sentence.

#### Scenario: Metadata and PWA manifest use lowercase brand name
- **WHEN** a browser loads `index.html` or installs the application via `manifest.json`
- **THEN** `<title>`, `apple-mobile-web-app-title`, `manifest.json` `name`, and `manifest.json` `short_name` all use lowercase `itemized`

#### Scenario: In-app UI copy uses lowercase brand name mid-sentence
- **WHEN** a user views the loading screen, navigation wordmark, or camera HTTPS error message
- **THEN** `itemized` appears in lowercase everywhere mid-sentence or in labels, and `Itemized` is capitalized only when it starts a sentence

# Spec Delta

## ADDED Requirements

### Requirement: Sidebar footer menu alignment
The navigation sidebar footer (in both the desktop sidebar and mobile slide-out drawer) SHALL align the `Help` link and the account/settings link (`user.email`) on the same leading horizontal axis with matching padding, icon sizing, icon-to-label spacing, and interactive surface styling, while preserving email truncation, the right-aligned `Logout` button (outside demo mode), and mobile bottom safe-area inset padding.

#### Scenario: Help and account settings links align vertically in sidebar footer
- **WHEN** a user views the navigation sidebar footer on desktop or in the mobile slide-out drawer
- **THEN** the `Help` link and the account/settings (`user.email`) link share the same horizontal inset (`px-2`), vertical padding (`py-1.5`), rounded surface treatment (`rounded-lg`), and icon-to-label gap (`gap-2`) so their icons and text labels align on the same vertical axis

#### Scenario: Long email address truncates without misaligning icons or pushing Logout out of view
- **WHEN** a signed-in user has a long email address in a non-demo session
- **THEN** the settings icon remains fixed-size (`shrink-0`), the email text truncates cleanly with an ellipsis inside its flex container (`min-w-0 flex-1`), and the `Logout` button remains visible and right-aligned beside it

#### Scenario: Active route state highlighted for both Help and Settings links
- **WHEN** a user navigates to `/help` or `/settings`
- **THEN** the corresponding sidebar footer link displays the active highlight style while maintaining identical horizontal alignment with the other footer link

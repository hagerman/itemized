# Spec Delta

## MODIFIED Requirements

### Requirement: Shared live scanner with mode switching
The web application SHALL provide a Scanner modal (bottom-aligned on mobile, middle-aligned on desktop) with a mode switcher (`Purchase`, `Consume`, `Open`, `Transfer`, `Inventory`) sharing one live camera stream, torch toggle, lens selector, audio feedback, and keyboard/HID input. The camera SHALL auto-start on mobile devices and stay hidden by default on desktop. The modal SHALL stay compact when collapsed and expand vertically into available viewport height to avoid unnecessary scrolling. When the camera API is unavailable in an insecure HTTP context, the scanner SHALL display an actionable message explaining that live camera scanning requires HTTPS (such as via a reverse proxy). When starting the live camera in a secure context without an explicit lens selection, the scanner SHALL request the rear-facing camera by default and populate the lens selector after camera permission is granted. Closing the Scanner modal SHALL reset all transient workflow state (including partially entered form fields, search results, lookup banners and in-flight lookup requests, item selections, unknown-barcode association state, transfer destination, inventory audit progress, status/error messages, and undo toasts) so reopening starts clean, while persisting only the user's last selected scan mode in browser storage so subsequent opens on that browser (including after page reloads) default to the previously chosen mode (falling back to `Purchase` when no valid mode is stored).

#### Scenario: Switching scan modes preserves camera session
- **WHEN** a user switches from `Purchase` to `Consume` in the Scanner view
- **THEN** the active camera stream and torch preference remain active without restarting the camera

#### Scenario: Camera starts automatically on mobile devices
- **WHEN** a user opens `Scan / Action` on a mobile viewport or coarse-pointer touch device
- **THEN** the live camera viewfinder is enabled by default without requiring an extra tap on the Camera button, and the user can still toggle it off

#### Scenario: Camera stays hidden by default on desktop
- **WHEN** a user opens `Scan / Action` on a desktop viewport
- **THEN** the live camera viewfinder remains hidden by default until the user clicks the Camera button

#### Scenario: Modal expands into available vertical space without clipping dropdowns
- **WHEN** a user opens a location or category selector inside `Scan & Action` while vertical viewport space is available
- **THEN** the selector menu is displayed without clipping or forced internal scrolling inside a short modal, while keeping the modal middle-aligned on desktop and bottom-aligned on mobile (scrolling only if content exceeds viewport height)

#### Scenario: Insecure HTTP context displays HTTPS guidance
- **WHEN** a user enables the camera in a non-secure context (e.g., `http://192.168.1.21:8080`) where `navigator.mediaDevices.getUserMedia` is unavailable
- **THEN** the scanner displays an error explaining that live camera scanning requires HTTPS (for example, placing Itemized behind an HTTPS reverse proxy) while keeping manual/HID barcode input usable

#### Scenario: Secure context without camera API displays browser-unavailable error
- **WHEN** a user enables the camera in a secure context whose browser lacks `navigator.mediaDevices.getUserMedia`
- **THEN** the scanner displays `"Camera API unavailable in this browser."`

#### Scenario: Rear camera is preferred by default and lens selector populates after permission
- **WHEN** a user starts the live camera in a secure context without having manually switched lenses
- **THEN** the scanner requests `{ facingMode: "environment" }` and refreshes the list of available video input devices after the camera stream starts so the lens switcher can cycle between cameras on iOS and other mobile browsers

#### Scenario: Closing and reopening resets all transient workflow state
- **WHEN** a user enters data or starts a workflow inside `Scan / Action` (such as scanning an unknown barcode and typing a new product name in `Purchase`, selecting candidate items in `Consume`, choosing a destination in `Transfer`, or scanning items in `Inventory`), closes the modal, and reopens it
- **THEN** all previously entered fields, search hits, candidate lists, destination/audit selections, status/error banners, and undo toasts are cleared and the modal opens in a fresh state

#### Scenario: In-flight barcode lookup from a closed modal is discarded
- **WHEN** a user scans an unknown barcode in `Purchase` mode, closes the modal before OpenFoodFacts or LLM classification finishes, and reopens the modal
- **THEN** the late response from the closed session does not populate form fields, banners, or search hits in the reopened modal

#### Scenario: Selected scan mode persists across modal reopens and browser reloads
- **WHEN** a user opens `Scan / Action`, switches from `Purchase` to `Consume`, closes the modal, and later reopens `Scan / Action` (either in the same session or after reloading the page on the same browser)
- **THEN** the modal opens with `Consume` selected as the active mode

#### Scenario: Default scan mode falls back to Purchase when storage is empty or invalid
- **WHEN** a user opens `Scan / Action` in a browser with no saved scan mode (or an unrecognized/unavailable stored value)
- **THEN** the modal opens in `Purchase` mode without errors

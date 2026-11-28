# Spec Delta

## ADDED Requirements

### Requirement: Mode-scoped QR code filtering during live camera scanning
In the shared Scanner modal, the live camera scanner SHALL ignore QR codes and decode only 1D retail barcode formats (UPC-A, UPC-E, EAN-13, EAN-8, Code 128, Code 39, ITF) while `Purchase` mode is active (including when targeting primary or second barcode inputs inside Purchase). While `Consume`, `Open`, `Transfer`, or `Inventory` mode is active, the live camera scanner SHALL decode both 1D retail barcodes and 2D QR codes. Switching between `Purchase` and any QR-enabled mode SHALL update QR decoding immediately across both native `BarcodeDetector` and WebAssembly decoders without restarting the camera stream or resetting the torch state.

#### Scenario: Live camera ignores QR codes in Purchase mode
- **WHEN** the Scanner modal is in `Purchase` mode with the live camera active and a QR code is in the viewfinder (alone or next to a retail UPC barcode)
- **THEN** the scanner excludes QR code formats from live camera decoding so the QR code does not trigger a scan, beep, or lookup, while an adjacent 1D retail barcode in the viewfinder decodes normally

#### Scenario: Live camera decodes QR codes in Consume, Open, Transfer, and Inventory modes
- **WHEN** the Scanner modal is in `Consume`, `Open`, `Transfer`, or `Inventory` mode with the live camera active and a QR code is in the viewfinder
- **THEN** the scanner includes QR code decoding and emits the decoded QR payload to the active workflow

#### Scenario: Switching between Purchase and Consume updates QR filtering without restarting camera
- **WHEN** a user has the live camera active in `Purchase` mode (with QR decoding disabled) and switches to `Consume` mode (or switches back from `Consume` to `Purchase`)
- **THEN** QR code decoding is immediately enabled in `Consume` and disabled in `Purchase` without stopping or restarting the active camera `MediaStream` or resetting the torch preference

## MODIFIED Requirements

### Requirement: Live barcode and QR decoding without native BarcodeDetector
The live camera scanner SHALL continuously decode 1D retail barcodes (UPC-A, UPC-E, EAN-13, EAN-8, Code 128, Code 39, ITF) and—when QR scanning is enabled for the active workflow—2D QR codes from the active video stream on browsers that do not implement the native `BarcodeDetector` API (including iOS Safari), using a self-hosted WebAssembly decoder bundled with the application (with no external CDN requests), without stalling on already-playing video elements or terminating on transient frame decode errors, and surfacing an error if the decoder fails to initialize.

#### Scenario: Decoding UPC or QR codes on iOS Safari without native BarcodeDetector
- **WHEN** the live camera stream starts and begins playing in a browser where `window.BarcodeDetector` is unavailable and QR scanning is enabled
- **THEN** the scanner captures frames from the active video stream once dimensions are available (`readyState >= 2`, `videoWidth > 0`, `videoHeight > 0`), decodes them using the self-hosted WebAssembly decoder, and emits decoded UPC barcodes and printed QR URLs to the active scan workflow

#### Scenario: Transient frame error does not halt continuous scanning
- **WHEN** a frame decode attempt fails with a transient error (such as no barcode in frame or an unready frame)
- **THEN** the scanner continues scheduling subsequent frame decode attempts until the camera is stopped or unmounted

#### Scenario: High-resolution rear camera constraints requested for sharp 1D/2D scanning
- **WHEN** the scanner starts the live camera
- **THEN** it requests ideal HD video dimensions (`1280x720`) alongside the selected camera constraint so fine 1D UPC bars and small printed QR codes remain legible on mobile devices

#### Scenario: Decoder initialization failure is surfaced to the user
- **WHEN** the self-hosted WebAssembly decoder fails to load or initialize
- **THEN** the scanner displays a visible error message in the camera banner instead of failing silently

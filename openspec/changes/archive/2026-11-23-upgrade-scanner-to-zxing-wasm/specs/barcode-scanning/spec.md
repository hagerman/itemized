# Spec Delta

## MODIFIED Requirements

### Requirement: Live barcode and QR decoding without native BarcodeDetector
The live camera scanner SHALL continuously decode both 1D retail barcodes (UPC-A, UPC-E, EAN-13, EAN-8, Code 128, Code 39, ITF) and 2D QR codes from the active video stream on browsers that do not implement the native `BarcodeDetector` API (including iOS Safari), using a self-hosted WebAssembly decoder bundled with the application (with no external CDN requests), without stalling on already-playing video elements or terminating on transient frame decode errors, and surfacing an error if the decoder fails to initialize.

#### Scenario: Decoding UPC or QR codes on iOS Safari without native BarcodeDetector
- **WHEN** the live camera stream starts and begins playing in a browser where `window.BarcodeDetector` is unavailable
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

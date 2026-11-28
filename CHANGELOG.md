# Changelog

## [0.14.1](https://github.com/itemizedapp/itemized/compare/v0.14.0...v0.14.1) (2026-11-28)


### Bug Fixes

* set ios pwa status bar style to default in index.html ([7b9fc68](https://github.com/itemizedapp/itemized/commit/7b9fc68ea63a095d3c0f72656f9d7d3470e70b67))

## [0.14.0](https://github.com/itemizedapp/itemized/compare/v0.13.0...v0.14.0) (2026-11-28)


### Features

* add server-side sorting for all inventory table columns and update UI controls ([7ac185c](https://github.com/itemizedapp/itemized/commit/7ac185ce47359d550707dadd1776446109becea3))
* add support for light, dark, and system user theme preferences ([c70e9b5](https://github.com/itemizedapp/itemized/commit/c70e9b5657553493062e94ad9ab2ae54c2407680))
* ignore QR codes during live camera scanning in purchase mode and variant scan (manufacturers like to put these next to the UPC barcode) ([7ed408a](https://github.com/itemizedapp/itemized/commit/7ed408a45f9428ea4c3258a1aa17e1d22ea74c9e))
* improve number input editing with expression support (e.g. "500/4" resolves to "125") and fixed empty-to-zero snap ([53ad2b0](https://github.com/itemizedapp/itemized/commit/53ad2b02c815b529b1241f2b0e60f3b3ed641db8))
* prevent reopening already opened items across api and ui ([214b253](https://github.com/itemizedapp/itemized/commit/214b25349eab6587a217997e8a294a770d9a5689))
* simplify default scanner input placeholder ([1bcf184](https://github.com/itemizedapp/itemized/commit/1bcf184b000609a7d0a1c8ecedbd878a5bd41149))


### Bug Fixes

* correct display issue for variants with no barcodes and handle item notes ([8474e07](https://github.com/itemizedapp/itemized/commit/8474e074ca686e7d1d5b2dc889ca9e191e7a1817))
* reset purchase quantity and transient form fields on new purchase or scan mode switch ([174f1cb](https://github.com/itemizedapp/itemized/commit/174f1cb68d1527ee4f98e525444212d41abeb14d))

## [0.13.0](https://github.com/itemizedapp/itemized/compare/v0.12.0...v0.13.0) (2026-11-27)


### Features

* add QR quick action screen and update SPA routing for QR links ([38bd216](https://github.com/itemizedapp/itemized/commit/38bd216101332f06d21efc7dbc4812283085478a))


### Bug Fixes

* added guard to a11y targetPath ([a6bdceb](https://github.com/itemizedapp/itemized/commit/a6bdcebbb0bdfc65fad4cfe79d35c6733238f23c))
* align inline freezer create icon and label in HierarchySelect ([7c46d84](https://github.com/itemizedapp/itemized/commit/7c46d84e4ba9a868b3c44debea3c1ee5ed220ab8))
* implement shared inventory cache invalidation to fix stale product data on update ([19d1a87](https://github.com/itemizedapp/itemized/commit/19d1a87e9b8446cb2e88715b91eafd962475ca9b))


### Code Refactoring

* use jsdom for html parsing in doc utilities and add security checks to static server ([fdbd319](https://github.com/itemizedapp/itemized/commit/fdbd3197705f9cdf3014b66cc9dd4d35a7910dc7))

## [0.12.0](https://github.com/itemizedapp/itemized/compare/v0.11.0...v0.12.0) (2026-11-27)


### Features

* add onboarding starter taxonomy endpoint and reduce new user friction ([30eeb93](https://github.com/itemizedapp/itemized/commit/30eeb937fe6780f6240d29b2a755c10ce1576678))

## [0.11.0](https://github.com/itemizedapp/itemized/compare/v0.10.1...v0.11.0) (2026-11-27)


### Features

* omit label printing UI elements when no enabled printers exist ([4f8ddca](https://github.com/itemizedapp/itemized/commit/4f8ddca39ae301c623a62d52eb72a35a32c15f80))

## [0.10.1](https://github.com/itemizedapp/itemized/compare/v0.10.0...v0.10.1) (2026-11-27)


### Bug Fixes

* handle logout redirect and state cleanup without requiring page reload ([a4dfe5f](https://github.com/itemizedapp/itemized/commit/a4dfe5f41b9b4ae0bbbbc8c63c20a7f335b8d17e))


### Code Refactoring

* rebalance documentation categories and paths ([58a02b1](https://github.com/itemizedapp/itemized/commit/58a02b1359f5f3540b697690b5e1f237356484c2))
* reorganize documentation into get-started, configure, use, and self-hosting categories ([477ac16](https://github.com/itemizedapp/itemized/commit/477ac16e736cfeff34bea925f1962776823cf428))

## [0.10.0](https://github.com/itemizedapp/itemized/compare/v0.9.1...v0.10.0) (2026-11-27)


### Features

* trigger Cloudflare Pages rebuild on release and pass secrets to workflow ([f4bd8a6](https://github.com/itemizedapp/itemized/commit/f4bd8a63fe16019ecdfb965b5bf7b31c31c2ec13))

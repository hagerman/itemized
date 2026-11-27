# Proposal

## Why

The demo environment (`DEMO_MODE=true`) currently seeds sample products using everyday adjective-first names (such as `Whole Milk`, `Baby Spinach`, `Black Beans`, and `Extra Virgin Olive Oil`) rather than the comma-inverted `Item` / `Item, Variety` / `Item, Variety, Detail` convention used by Itemized's LLM product classifier and bulk reclassifier. Aligning the demo sample catalog with the LLM naming convention gives visitors an immediate, consistent example of how Itemized organizes generic household products alphabetically by base item.

## What Changes

- Update the seeded sample product names in `internal/demo/seed.go` to follow Itemized's standardized comma-inverted Title Case convention (`Item`, `Item, Variety`, or `Item, Variety, Detail`), omitting brands, sizes, packaging, and store-department prefixes, using plural for countable items and singular for uncountable/mass nouns:
  - `Whole Milk` → `Milk, Whole`
  - `Baby Spinach` → `Spinach, Baby`
  - `Greek Yogurt` → `Yogurt, Greek`
  - `Chicken Stock` → `Stock, Chicken`
  - `Fresh Salsa` → `Salsa, Fresh`
  - `Whole Grain Pasta` → `Pasta, Whole Grain`
  - `Extra Virgin Olive Oil` → `Oil, Olive, Extra Virgin`
  - `Black Beans` → `Beans, Black`
  - `Mixed Berries` → `Berries, Mixed`
  - `Ground Beef` → `Beef, Ground`
  - `Paper Towels` → `Paper Towels` (unchanged; base `Item` form)
  - `Sparkling Water` → `Water, Sparkling`
  - `Whole Bean Coffee` → `Coffee, Whole Bean`
  - `Dish Soap` → `Soap, Dish`
- Keep seeded variants, barcodes, categories, locations, measurements, and relative item dates unchanged (variants continue to represent brand/flavor/package-size specifics).
- Add test coverage in `internal/demo/demo_test.go` verifying the seeded product names follow the standardized naming convention and remain searchable via FTS5.

## Capabilities

### New Capabilities

_(None)_

### Modified Capabilities

- `demo-mode`: Require seeded demo sample product names to follow the standardized `Item`, `Item, Variety`, or `Item, Variety, Detail` LLM naming convention.

## Impact

- **Code**: `internal/demo/seed.go`, `internal/demo/demo_test.go`
- **APIs / Schema**: No API, database schema, or migration changes.
- **Compatibility**: Demo databases are ephemeral and re-seeded on startup and at each reset interval; existing non-demo databases are unaffected.

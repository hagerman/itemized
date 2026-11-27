# Spec Delta

## ADDED Requirements

### Requirement: Standardized LLM product naming for demo sample data
All seeded product names in demo mode SHALL follow Itemized's standardized comma-inverted Title Case LLM naming convention (`Item`, `Item, Variety`, or `Item, Variety, Detail`), omitting brands, sizes, packaging, and store-department prefixes, using plural for countable items and singular for uncountable/mass nouns.

#### Scenario: Seeded product names follow the LLM naming convention
- **WHEN** the demo database is seeded
- **THEN** every seeded product name conforms to the standardized `Item`, `Item, Variety`, or `Item, Variety, Detail` convention (such as `Milk, Whole`, `Spinach, Baby`, `Beans, Black`, `Oil, Olive, Extra Virgin`, and `Paper Towels`)

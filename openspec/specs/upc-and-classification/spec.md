# upc-and-classification Specification

## Purpose

Resolves unrecognized retail UPC/EAN barcodes directly against OpenFoodFacts and optionally normalizes product names, measurements, and category matches using a user-configured LLM provider.

## Requirements

### Requirement: Direct UPC lookup via OpenFoodFacts
When a scanned retail barcode is not already associated in `barcodes`, the system SHALL query OpenFoodFacts and return the normalized title, description, and measurement if found.

#### Scenario: Successful OpenFoodFacts lookup
- **WHEN** an unrecognized retail barcode is looked up and OpenFoodFacts returns product data
- **THEN** the system returns the normalized title, description, and measurement for use in product creation

#### Scenario: Barcode not found or upstream unavailable
- **WHEN** OpenFoodFacts returns no match or is unreachable
- **THEN** the system returns a not-found result without failing the Purchase workflow so the user can still create or select a product manually

### Requirement: Opt-in LLM product classification
LLM product classification SHALL be disabled by default and SHALL not be required to run the application. When configured with a provider (`anthropic`, `openai`, `gemini`, or `openai-compatible` with custom base URL such as Ollama), model name, and optional API key, the system SHALL normalize a raw UPC title and quantity into a standardized generic product name, structured measurement (`value`, `unit_type`, `unit`), and optional matching `category_id` from the household's existing categories.

#### Scenario: Purchase flow works when LLM is unconfigured
- **WHEN** no LLM provider is configured and a user scans an unknown barcode
- **THEN** the system skips LLM classification without error and presents the raw OpenFoodFacts title for manual product selection or creation

#### Scenario: LLM classification returns structured suggestion
- **WHEN** an LLM provider is configured and classification succeeds
- **THEN** the system returns a standardized product name, optional measurement, and a `category_id` that is either `null` or an exact existing category ID

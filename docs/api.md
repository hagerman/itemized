---
title: HTTP API reference
summary: Authenticate with session cookies and automate inventory, scanning, label printing, and settings over JSON HTTP endpoints.
audience: developer
entry_point: integrate
order: 1
capabilities:
  - inventory-catalog
  - barcode-scanning
  - label-printing
  - user-auth
screens: []
---

Itemized exposes a JSON HTTP API under `/api/*` using session cookies (`itemized_session`). All request and response bodies use `application/json`.

## Error responses

Every error response returns a JSON object `{"error": "<message>"}` with one of the following HTTP status codes:

| Status | Canonical code | Meaning |
| --- | --- | --- |
| `400` | `invalid json` | Malformed JSON body, invalid path ID, or invalid request parameters. |
| `401` | `unauthorized` | Missing, expired, or invalid session cookie or login credentials. |
| `403` | `forbidden` | Action requires administrator role, setup is already complete, or action is disabled in demo mode. |
| `404` | `not found` | Requested route or resource (product, item, category, location, user, printer) does not exist. |
| `409` | `conflict` | Uniqueness or referential integrity conflict (duplicate product name, email in use, or resource in use). |
| `413` | `request body too large` | JSON request body exceeded the 1 MiB limit. |
| `422` | `validation error` | Request JSON was valid but failed domain validation (missing required fields, invalid hierarchy, or invalid template). |
| `429` | `rate limited` | Too many login attempts or demo-mode UPC lookups in the rate-limit window. |
| `500` | `internal server error` | Unexpected server or database error. |
| `502` | `upstream unavailable` | External OIDC, OpenFoodFacts, LLM, or LAN printer endpoint failed or could not be reached. |

## Verified API examples

The examples below are executed automatically against an in-process itemized server by `go test ./internal/docsverify/...`.

### Authentication (unauthenticated check)

```http run unauthenticated
GET /api/auth/me

# expect-status: 401
# expect-keys: error
```

### Authentication (current user)

```http run
GET /api/auth/me

# expect-status: 200
# expect-keys: user
```

### Invalid JSON input

```http run
POST /api/categories
Content-Type: application/json

{invalid-json

# expect-status: 400
# expect-keys: error
```

### Categories

```http run
POST /api/categories
Content-Type: application/json

{"name": "API Snacks"}

# expect-status: 201
# expect-keys: category
# capture: category_id=category.id
```

### Locations

```http run
POST /api/locations
Content-Type: application/json

{"name": "API Pantry", "is_freezer": false}

# expect-status: 201
# expect-keys: location
# capture: location_id=location.id
```

### Products, variants, and barcodes

```http run
POST /api/products
Content-Type: application/json

{"name": "Crackers, Sea Salt", "category_id": {{category_id}}, "default_location_id": {{location_id}}, "default_due_days": 90, "use_average_for_due_date": false}

# expect-status: 201
# expect-keys: product
# capture: product_id=product.id
```

```http run
POST /api/products/{{product_id}}/variants
Content-Type: application/json

{"name": "Brand A 8 oz"}

# expect-status: 201
# expect-keys: variant
# capture: variant_id=variant.id
```

```http run
POST /api/variants/{{variant_id}}/barcodes
Content-Type: application/json

{"barcode": "012345678905"}

# expect-status: 201
# expect-keys: barcode
```

### Items

```http run
POST /api/items
Content-Type: application/json

{"product_id": {{product_id}}, "variant_id": {{variant_id}}, "location_id": {{location_id}}, "quantity": 1}

# expect-status: 201
# expect-keys: items
```

### Scan and workflows

```http run
POST /api/scan/resolve
Content-Type: application/json

{"input": "012345678905"}

# expect-status: 200
# expect-keys: kind, product
```

### Label printers and templates

```http run
GET /api/label-templates

# expect-status: 200
# expect-keys: templates
```

### Settings

```http run
GET /api/settings

# expect-status: 200
# expect-keys: base_url, due_date_average_count
```

# Tasks

## 1. Backend API Fixes (Variant Barcodes & Item Notes Normalization)

- [x] 1.1 Update `Variant.Barcodes` in `internal/api/catalog.go` from `json:"barcodes,omitempty"` to `json:"barcodes"`, verify all `Variant` responses initialize `Barcodes: []Barcode{}`, and add a Go API test in `internal/api/api_test.go` asserting `GET /api/products/:id` returns `"barcodes": []` for a variant with zero barcodes (verify with `go test ./internal/api/...`).
- [x] 1.2 Update `handleUpdateItem` in `internal/api/items.go` to trim leading/trailing whitespace on `notes` (storing `NULL` when empty/whitespace-only) and add a Go API test in `internal/api/api_test.go` covering setting, trimming, and clearing item notes via `PATCH /api/items/:id` (verify with `go test ./internal/api/...`).

## 2. Product Detail Page: Resilient Barcodes & Item Notes Display/Editing

- [x] 2.1 Guard `v.barcodes` rendering in `web/src/pages/ProductDetailPage.tsx` with `(v.barcodes ?? []).map(...)` and add a Vitest regression test in `web/src/pages/ProductDetailPage.test.tsx` verifying `/products/:id` loads cleanly when a variant omits `barcodes` or has `barcodes: []` (verify with `npm --prefix web test -- ProductDetailPage`).
- [x] 2.2 Display item `notes` and add inline add/edit/clear note controls (`PATCH /api/items/:id`) to both the mobile stacked item cards and desktop table rows in `web/src/pages/ProductDetailPage.tsx` without introducing horizontal scroll on mobile, and add Vitest tests in `web/src/pages/ProductDetailPage.test.tsx` covering viewing, adding, editing, and clearing item notes (verify with `npm --prefix web test -- ProductDetailPage`).

## 3. QR Quick Action Page: Inline Item Notes Editing

- [x] 3.1 Add inline add/edit/clear note controls (`PATCH /api/items/:id`) to the Item Quick Action view (`/go/i/:id`) in `web/src/pages/QrActionPage.tsx`, updating the displayed note on save, and add Vitest tests in `web/src/pages/QrActionPage.test.tsx` covering editing and clearing notes (verify with `npm --prefix web test -- QrActionPage`).

## 4. Verification

- [x] 4.1 Run full Go verification: `go test ./...`, `go vet ./...`, and `gopls check` on modified/all Go files (resolving `gopls` from `PATH` or `$(go env GOPATH)/bin/gopls`), fixing any reported diagnostics.
- [x] 4.2 Run full frontend test suite and production build (`npm --prefix web test` and `npm --prefix web run build`) and verify all checks pass cleanly.

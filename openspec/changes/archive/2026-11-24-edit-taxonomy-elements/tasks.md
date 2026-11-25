# Tasks

## 1. Backend Taxonomy Update Validation

- [x] 1.1 Update `handleUpdateCategory` and `handleUpdateLocation` in `internal/api/catalog.go` to reject empty/whitespace-only `name` values with HTTP 422 (`"name is required"`) and to reject setting `parent_id` to any descendant of the edited node (using `collectDescendantCategoryIDs` / `collectDescendantLocationIDs`) with HTTP 422, and add Go API tests in `internal/api/api_test.go` covering successful category/location renames, reparenting, clearing `parent_id` to `null`, toggling `is_freezer`, rejecting blank names, and rejecting self-parenting and multi-hop descendant cycles; verify with `go test ./internal/api/...`.

## 2. Frontend Taxonomy Editing UI

- [x] 2.1 Add `collectDescendantIds` helper to `web/src/components/HierarchySelect.tsx` to return a node ID and all of its transitive descendants, and add unit test coverage in `web/src/components/HierarchySelect.test.tsx`; verify with `cd web && npm test -- src/components/HierarchySelect.test.tsx`.
- [x] 2.2 Add inline row editing to `CategoriesPage` in `web/src/pages/TaxonomyPages.tsx` (edit button per row, inline form with name input, `HierarchySelect` parent picker excluding self and descendants, Save/Cancel buttons, inline error feedback, and React Query invalidation for `categories`, `products`, and `product`) and verify with component tests in `web/src/pages/TaxonomyPages.test.tsx`.
- [x] 2.3 Add inline row editing to `LocationsPage` and inline header editing to `LocationDetailPage` in `web/src/pages/TaxonomyPages.tsx` (name input, `HierarchySelect` parent picker excluding self and descendants, `Freezer` checkbox, Save/Cancel buttons, inline error feedback, and React Query invalidation for `locations`, `location`, `products`, and `product`) and verify with component tests in `web/src/pages/TaxonomyPages.test.tsx` (covering rename, reparent, clear to top-level, toggle `is_freezer`, cycle exclusion in picker, cancel, and API error display).

## 3. End-to-End Verification

- [x] 3.1 Run `go test ./...`, `go vet ./...`, and `gopls check` on Go files (resolving `gopls` from `PATH` or `$(go env GOPATH)/bin/gopls`), plus `cd web && npm test && npm run build`, and confirm all checks pass with zero errors or diagnostics.

# Tasks

## 1. Inline Freezer Create Button Alignment

- [x] 1.1 Update the inline freezer creation button in `web/src/components/HierarchySelect.tsx` so the leading `+` (or `Loader2`) icon is immediately followed by `Create Freezer`, then the `Snowflake` icon, then `“<name>”` (and optional ` in <parent>`), keeping `Create` horizontally aligned with the `+ Create “<name>”` button above it while preserving the button's accessible name (`Create Freezer “<name>”`), truncation, and click/error behavior; add/update unit test assertions in `web/src/components/HierarchySelect.test.tsx` to verify the snowflake icon renders after `Freezer` and before the quoted name, and verify with `npm test` in `web/` (including `HierarchySelect.test.tsx` and `ProductFormPage.test.tsx`).

## 2. Verification

- [x] 2.1 Run `npm run build` in `web/` to verify TypeScript compilation and bundle build succeed, and run `go test ./...`, `go vet ./...`, and `gopls check` on Go files to confirm repository-wide checks pass cleanly.

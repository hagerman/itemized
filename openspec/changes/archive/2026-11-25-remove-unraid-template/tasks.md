# Tasks

## 1. Remove in-repo Unraid template

- [x] 1.1 Delete `unraid/itemized.xml` and the `unraid/` directory from the repository, and verify no files remain under `unraid/` and no references to `unraid/itemized.xml` exist in active repo files.

## 2. Update Unraid documentation to link to itemized-unraid

- [x] 2.1 Update `docs/self-hosting/unraid.md` to reference `https://github.com/itemizedapp/itemized-unraid` (and Unraid Community Apps) instead of `unraid/itemized.xml`, and update the Unraid row in `docs/self-hosting/README.md` to describe the external `itemizedapp/itemized-unraid` template; run `make docs-build` to regenerate `README.md` and `web/src/generated/help/`, and verify `make docs-check` passes.

## 3. Verification

- [x] 3.1 Run full repository checks (`make check`, `go test ./...`, `go vet ./...`, and `gopls check` on Go files) and verify all checks and tests pass.

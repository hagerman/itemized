# Spec Delta

## ADDED Requirements

### Requirement: README maintained from docs
The repository `README.md` SHALL be generated from `docs/` during the docs build, deriving feature links/summaries from front matter, Quick Start snippets and deployment options from `docs/self-hosting/`, the Configuration table from `docs/self-hosting/configuration.md` with repo-root relative links, and curated UI screenshots exclusively from `docs/assets/`. The docs check SHALL fail if `README.md` is stale, has broken links or missing images/alt text, or violates brand capitalization rules.

#### Scenario: Docs update flows into README
- **WHEN** an environment variable row in `docs/self-hosting/configuration.md` or a Quick Start snippet in `docs/self-hosting/docker-compose.md` is updated and the docs build runs
- **THEN** `README.md` reflects the updated table row or snippet with valid repository-root relative links

#### Scenario: Stale README fails docs check
- **WHEN** `docs/` is modified or `README.md` is edited out of sync without running the docs build
- **THEN** the docs check fails and reports that `README.md` is stale and instructs running `make docs-build`

#### Scenario: README uses automated docs screenshots
- **WHEN** `README.md` is generated from `docs/`
- **THEN** the hero image and screenshot gallery reference existing PNG files under `docs/assets/` with descriptive alt text, and the legacy `docs/screenshot-inventory.jpg` is no longer referenced or present

#### Scenario: Broken image or link in README fails docs check
- **WHEN** a screenshot or relative link referenced by `README.md` does not exist on disk or lacks alt text
- **THEN** the docs check fails and names the missing image, missing link target, or missing alt text in `README.md`

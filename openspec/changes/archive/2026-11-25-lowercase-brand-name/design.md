# Design

## Context

See [proposal.md](proposal.md) for motivation.

`itemized-website` enforces lowercase `itemized` via `openspec/specs/site-chrome-and-design/spec.md` ("Brand name capitalization") and `scripts/checks/seo.mjs`, which flags any non-sentence-start `Itemized` matching `/(?:[a-z0-9,’"”]|©\s*\d+)\s+Itemized\b/g` across rendered HTML text nodes.

In `itemized`, ~90 occurrences of `Itemized` exist across:
- Web metadata & UI: `web/index.html`, `web/public/manifest.json`, `web/src/App.tsx`, `web/src/components/BarcodeScanner.tsx`, `web/src/pages/HelpPage.tsx` (and corresponding assertions in `pwa.test.ts`, `Scanner.test.tsx`, `HelpPage.test.tsx`).
- Docs builder & generated strings: `web/scripts/docs/lib.ts` (`ENTRY_POINTS`), `web/scripts/docs/build.ts` (`HELP_TASK_ENTRIES`, landing `<h1>`, footer text, meta description).
- Authored Markdown: `docs/**/*.md`, `README.md`, `CONTRIBUTING.md`.

## Goals / Non-Goals

**Goals:**
- Apply the exact same brand-casing rule as `itemized-website`: lowercase `itemized` everywhere except when `Itemized` is the first word of a sentence.
- Enforce the rule automatically in `web/scripts/docs/check.ts` (`make docs-check`) so future docs edits cannot reintroduce mid-sentence or title-cased `Itemized`.
- Keep all code identifiers, Go struct/log symbols, and URLs untouched unless they are user-facing brand strings.

**Non-Goals:**
- Renaming Go symbols, TypeScript component names, or existing archived OpenSpec files.
- Editing `itemized-website` inside this change (though once this change lands, `itemized-website`'s `docs/` exemption in `seo.mjs` can optionally be removed).

## Decisions

### 1. Match `itemized-website`'s exact regex in `web/scripts/docs/check.ts`
- **Choice**: Inspect rendered text (headings, paragraphs, list items, table cells, front matter `title` and `summary`, and generated static HTML) using the same non-sentence-start detector (`/(?:[a-z0-9,’"”]|©\s*\d+)\s+Itemized\b/g`) plus checking that titles/labels do not start with standalone `Itemized` when they are brand titles rather than sentences (e.g., `itemized documentation`, `itemized` in `README.md` / `web/index.html`).
- **Rationale**: Exact parity with `itemized-website/scripts/checks/seo.mjs` guarantees that `dist/docs/` passes both repos' checks with zero false positives on genuine sentence starts (`"Itemized stores all state in a single SQLite database."`) and catches every mid-sentence or mid-heading violation (`"Use Itemized"`, `"Install Itemized on your phone"`, `"serve Itemized over HTTPS"`).

### 2. Lowercase PWA & HTML metadata
- **Choice**: Set `<title>itemized</title>`, `apple-mobile-web-app-title="itemized"`, and `manifest.json` `name`/`short_name` to `"itemized"`.
- **Rationale**: Matches `Layout.tsx`'s existing lowercase `<span>itemized</span>` sidebar wordmark and `itemized-website`'s `og:site_name="itemized"`.

## Risks / Trade-offs

- **Regex false positives in fenced code blocks or URLs** → Strip fenced code blocks (` ```...``` `) and inline code spans (`` `...` ``) before checking prose in `web/scripts/docs/check.ts` so code examples or systemd `Description=` strings are not falsely flagged.

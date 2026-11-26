import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { APP_SCREEN_IDS } from "../../src/screens";
import { buildAllDocs, detectDocsVersion, generateHelpFilesContent } from "./build";
import { ParsedDoc, VALID_AUDIENCES, VALID_ENTRY_POINTS, loadDocs, repoRoot } from "./lib";
import { generateReadmeContent } from "./readme";

export interface CheckOptions {
  root?: string;
  screenIds?: string[];
  checkStaleness?: boolean;
  buildSite?: boolean;
  checkReadme?: boolean;
}

const BAD_BRAND_RE = /(?:\b[A-Za-z][a-z0-9'-]*|[0-9,’"”]|©\s*\d+)\s+Itemized\b/g;

function stripCode(md: string): string {
  return md.replace(/```[\s\S]*?```/g, " ").replace(/`[^`]*`/g, " ");
}

function checkReadmeFile(
  root: string,
  docs: ParsedDoc[],
  byRelPath: Map<string, ParsedDoc>,
  checkStaleness: boolean,
  errors: string[]
): void {
  const readmePath = path.join(root, "README.md");
  if (!fs.existsSync(readmePath)) {
    if (checkStaleness) {
      errors.push("README.md: missing generated README.md (run 'make docs-build')");
    }
    return;
  }

  const content = fs.readFileSync(readmePath, "utf8");

  // 1. Staleness check against docs-generated README
  if (checkStaleness) {
    try {
      const expected = generateReadmeContent(docs);
      if (content !== expected) {
        errors.push("README.md: generated README.md is stale (run 'make docs-build')");
      }
    } catch (err) {
      errors.push(`README.md: failed to generate expected README: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const contentWithoutCode = stripCode(content);

  // 2. HTML <img> tags: non-empty alt and existing local file
  const imgTagRe = /<img\b([^>]*?)\/?>/gi;
  let imgMatch: RegExpExecArray | null;
  while ((imgMatch = imgTagRe.exec(contentWithoutCode)) !== null) {
    const attrs = imgMatch[1];
    const srcMatch = attrs.match(/\bsrc\s*=\s*"([^"]*)"/i) ?? attrs.match(/\bsrc\s*=\s*'([^']*)'/i);
    const altMatch = attrs.match(/\balt\s*=\s*"([^"]*)"/i) ?? attrs.match(/\balt\s*=\s*'([^']*)'/i);
    const src = srcMatch?.[1]?.trim() ?? "";
    const alt = altMatch?.[1]?.trim() ?? "";
    if (!alt) {
      errors.push(`README.md: image '${src || "(missing src)"}' is missing alt text`);
    }
    if (src && !/^(https?:|data:)/i.test(src)) {
      const absImg = path.resolve(root, src);
      if (!fs.existsSync(absImg)) {
        errors.push(`README.md: missing image file '${src}'`);
      }
    }
  }

  // 3. Markdown images: ![alt](src)
  const mdImgRe = /!\[([^\]]*)\]\(([^)]+)\)/g;
  let mdImgMatch: RegExpExecArray | null;
  while ((mdImgMatch = mdImgRe.exec(contentWithoutCode)) !== null) {
    const alt = mdImgMatch[1].trim();
    const src = mdImgMatch[2].trim();
    if (!alt) {
      errors.push(`README.md: image '${src}' is missing alt text`);
    }
    if (src && !/^(https?:|data:)/i.test(src)) {
      const absImg = path.resolve(root, src);
      if (!fs.existsSync(absImg)) {
        errors.push(`README.md: missing image file '${src}'`);
      }
    }
  }

  // 4. Relative links (both Markdown [text](href) and HTML <a href="...">)
  const hrefs: string[] = [];
  const mdLinkRe = /(?<!!)\[[^\]]+\]\(([^)]+)\)/g;
  let linkMatch: RegExpExecArray | null;
  while ((linkMatch = mdLinkRe.exec(contentWithoutCode)) !== null) {
    hrefs.push(linkMatch[1].trim());
  }
  const htmlLinkRe = /<a\b[^>]*\bhref\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;
  let htmlLinkMatch: RegExpExecArray | null;
  while ((htmlLinkMatch = htmlLinkRe.exec(contentWithoutCode)) !== null) {
    hrefs.push((htmlLinkMatch[1] ?? htmlLinkMatch[2] ?? "").trim());
  }

  for (const href of hrefs) {
    if (!href || /^(https?:|mailto:|tel:|#)/i.test(href)) continue;
    const [rawTarget, anchor] = href.split("#");
    const normalized = path.posix.normalize(rawTarget);
    if (normalized.startsWith("docs/") && normalized.endsWith(".md")) {
      const docRel = normalized.slice("docs/".length);
      const targetDoc = byRelPath.get(docRel);
      if (!targetDoc) {
        errors.push(`README.md: broken link '${href}' (target '${normalized}' not found)`);
        continue;
      }
      if (anchor && !targetDoc.headings.some((h) => h.id === anchor)) {
        errors.push(`README.md: broken anchor '${href}' (heading '#${anchor}' not found in ${normalized})`);
      }
    } else {
      const absTarget = path.resolve(root, rawTarget);
      if (!fs.existsSync(absTarget)) {
        errors.push(`README.md: broken relative file link '${href}'`);
      }
    }
  }

  // 5. Brand capitalization check (strip HTML tags so alt="..." attributes don't false-positive)
  const plainLines = contentWithoutCode.replace(/<!--[\s\S]*?-->/g, " ").replace(/<[^>]+>/g, " ").split(/\r?\n/);
  for (const line of plainLines) {
    const matches = line.replace(/\s+/g, " ").trim().match(BAD_BRAND_RE);
    if (matches) {
      errors.push(`README.md: non-sentence-start "Itemized" in body (${matches.join(", ")})`);
    }
  }
}

export function checkDocs(opts: CheckOptions = {}): string[] {
  const root = opts.root ?? repoRoot();
  const docsDir = path.join(root, "docs");
  const screenIds = opts.screenIds ?? APP_SCREEN_IDS;
  const checkStaleness = opts.checkStaleness ?? true;
  const buildSite = opts.buildSite ?? true;
  const checkReadme = opts.checkReadme ?? true;

  const errors: string[] = [];
  const docs = loadDocs(docsDir);

  if (docs.length === 0) {
    errors.push("No Markdown files found under docs/");
    return errors;
  }

  const byRelPath = new Map<string, ParsedDoc>(docs.map((d) => [d.relPath, d]));
  const coveredCapabilities = new Set<string>();
  const screenDeclarations = new Map<string, string[]>();

  for (const doc of docs) {
    const fm = doc.frontMatter;

    // 1. Required front matter
    if (!fm.title) errors.push(`${doc.relPath}: missing required front matter 'title'`);
    if (!fm.summary) errors.push(`${doc.relPath}: missing required front matter 'summary'`);
    if (!VALID_AUDIENCES.has(fm.audience)) {
      errors.push(`${doc.relPath}: invalid or missing front matter 'audience' (${fm.audience || "empty"})`);
    }
    if (!VALID_ENTRY_POINTS.has(fm.entry_point)) {
      errors.push(`${doc.relPath}: invalid or missing front matter 'entry_point' (${fm.entry_point || "empty"})`);
    }
    if (!Array.isArray(doc.rawFrontMatter.capabilities)) {
      errors.push(`${doc.relPath}: missing front matter 'capabilities' array`);
    }
    if (!Array.isArray(doc.rawFrontMatter.screens)) {
      errors.push(`${doc.relPath}: missing front matter 'screens' array`);
    }

    for (const c of fm.capabilities) coveredCapabilities.add(c);
    for (const s of fm.screens) {
      const list = screenDeclarations.get(s) ?? [];
      list.push(doc.relPath);
      screenDeclarations.set(s, list);
    }

    // 2. User guide rules: < 600 words and screenshot first
    if (fm.audience === "user") {
      if (doc.wordCount >= 600) {
        errors.push(`${doc.relPath}: user guide exceeds 600-word limit (${doc.wordCount} words)`);
      }
      const trimmedBody = doc.processedBody.trimStart();
      if (!trimmedBody.startsWith("![")) {
        errors.push(`${doc.relPath}: user guide must lead with a screenshot image`);
      }
    }

    // 3. Images exist and have non-empty alt text
    for (const img of doc.images) {
      if (!img.alt || !img.alt.trim()) {
        errors.push(`${doc.relPath}: image '${img.src}' is missing alt text`);
      }
      if (!/^(https?:|data:)/i.test(img.src)) {
        const absImg = path.resolve(path.dirname(doc.absPath), img.src);
        if (!fs.existsSync(absImg)) {
          errors.push(`${doc.relPath}: missing image file '${img.src}'`);
        }
      }
    }

    // 4b. Brand name capitalization (lowercase "itemized" everywhere except sentence start)
    const badBrandRe = /(?:\b[A-Za-z][a-z0-9'-]*|[0-9,’"”]|©\s*\d+)\s+Itemized\b/g;
    const stripCode = (md: string) =>
      md
        .replace(/```[\s\S]*?```/g, " ")
        .replace(/`[^`]*`/g, " ");
    for (const [label, text] of [
      ["front matter title", fm.title],
      ["front matter summary", fm.summary],
    ] as const) {
      const matches = text.replace(/\s+/g, " ").match(badBrandRe);
      if (matches) {
        errors.push(`${doc.relPath}: non-sentence-start "Itemized" in ${label} (${matches.join(", ")})`);
      }
    }
    for (const line of stripCode(doc.processedBody).split(/\r?\n/)) {
      const matches = line.replace(/\s+/g, " ").trim().match(badBrandRe);
      if (matches) {
        errors.push(`${doc.relPath}: non-sentence-start "Itemized" in body (${matches.join(", ")})`);
      }
    }

    // 5. Internal links and heading anchors resolve
    for (const link of doc.links) {
      const href = link.href;
      if (!href || /^(https?:|mailto:|tel:)/i.test(href)) continue;

      if (href.startsWith("#")) {
        const anchor = href.slice(1);
        if (!doc.headings.some((h) => h.id === anchor)) {
          errors.push(`${doc.relPath}: broken anchor link '${href}'`);
        }
        continue;
      }

      const [rawTarget, anchor] = href.split("#");
      const resolvedRel = path.posix.normalize(
        path.posix.join(path.posix.dirname(doc.relPath), rawTarget)
      );
      if (resolvedRel.endsWith(".md")) {
        const targetDoc = byRelPath.get(resolvedRel);
        if (!targetDoc) {
          errors.push(`${doc.relPath}: broken link '${href}' (target '${resolvedRel}' not found)`);
          continue;
        }
        if (anchor && !targetDoc.headings.some((h) => h.id === anchor)) {
          errors.push(`${doc.relPath}: broken anchor '${href}' (heading '#${anchor}' not found in ${resolvedRel})`);
        }
      } else {
        const absTarget = path.resolve(path.dirname(doc.absPath), rawTarget);
        if (!fs.existsSync(absTarget)) {
          errors.push(`${doc.relPath}: broken relative file link '${href}'`);
        }
      }
    }
  }

  // 5. Every capability in openspec/specs/ is covered by at least one page
  const specsDir = path.join(root, "openspec/specs");
  if (fs.existsSync(specsDir)) {
    const specDirs = fs
      .readdirSync(specsDir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && !e.name.startsWith("."))
      .map((e) => e.name)
      .sort();
    for (const cap of specDirs) {
      if (!coveredCapabilities.has(cap)) {
        errors.push(`openspec/specs/${cap}: capability is not listed in any docs page's 'capabilities:' front matter`);
      }
    }
  }

  // 6. Every screen ID in APP_SCREEN_IDS is covered, and every settings/* screen is declared by exactly one page
  const validScreenSet = new Set(screenIds);
  for (const id of screenIds) {
    const decls = screenDeclarations.get(id) ?? [];
    if (decls.length === 0) {
      errors.push(`screen '${id}': not declared by any docs page's 'screens:' front matter`);
    } else if (id.startsWith("settings/") && decls.length > 1) {
      errors.push(`screen '${id}': Settings screen must be declared by exactly one page, found in ${decls.join(", ")}`);
    }
  }
  for (const [id, decls] of screenDeclarations) {
    if (!validScreenSet.has(id)) {
      errors.push(`screen '${id}': declared in ${decls.join(", ")} but not registered in web/src/screens.ts`);
    }
  }

  // 7. Self-hosting platform pages linked from docs/self-hosting/README.md
  const shHandbook = byRelPath.get("self-hosting/README.md");
  if (shHandbook) {
    const shLinks = new Set(
      shHandbook.links
        .map((l) => l.href.split("#")[0])
        .map((h) => path.posix.normalize(path.posix.join("self-hosting", h)))
    );
    for (const doc of docs) {
      if (
        doc.relPath.startsWith("self-hosting/") &&
        doc.relPath !== "self-hosting/README.md" &&
        doc.relPath !== "self-hosting/configuration.md"
      ) {
        if (!shLinks.has(doc.relPath)) {
          errors.push(`${doc.relPath}: orphan self-hosting platform page not linked from docs/self-hosting/README.md`);
        }
      }
    }
  }

  // 8. Check generated in-app help staleness
  // Ignore HELP_VERSION differences so tagging an already-committed revision
  // (which changes `git describe --tags`) does not trip the staleness check.
  if (checkStaleness) {
    const version = detectDocsVersion(root);
    const expectedHelp = generateHelpFilesContent(docs, version);
    const helpDir = path.join(root, "web/src/generated/help");
    const stripVersion = (s: string) =>
      s.replace(/^export const HELP_VERSION = .*;$/m, "export const HELP_VERSION = <version>;");
    for (const [name, expectedContent] of expectedHelp) {
      const actualPath = path.join(helpDir, name);
      if (!fs.existsSync(actualPath)) {
        errors.push(`web/src/generated/help/${name}: missing generated in-app help file (run 'make docs-build')`);
      } else {
        const actual = fs.readFileSync(actualPath, "utf8");
        if (stripVersion(actual) !== stripVersion(expectedContent)) {
          errors.push(`web/src/generated/help/${name}: generated in-app help is stale (run 'make docs-build')`);
        }
      }
    }
  }

  // 9. Verify README.md freshness, images, links, and brand capitalization
  if (checkReadme) {
    checkReadmeFile(root, docs, byRelPath, checkStaleness, errors);
  }

  // 10. Verify static website builds cleanly
  if (buildSite && errors.length === 0) {
    try {
      buildAllDocs(root);
    } catch (err) {
      errors.push(`static docs website build failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return errors;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const errors = checkDocs();
  if (errors.length > 0) {
    console.error("Docs check failed:");
    for (const err of errors) {
      console.error(`  - ${err}`);
    }
    process.exit(1);
  }
  console.log("Docs check passed.");
}

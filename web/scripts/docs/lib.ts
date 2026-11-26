import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";
import { Marked } from "marked";
import { KEYBOARD_SHORTCUTS } from "../../src/shortcuts";

export type Audience = "user" | "admin" | "developer";
export type EntryPointId =
  | "get-started"
  | "use"
  | "self-host"
  | "integrate"
  | "reference"
  | "under-the-hood";

export interface EntryPointMeta {
  id: EntryPointId;
  title: string;
  description: string;
}

export const ENTRY_POINTS: EntryPointMeta[] = [
  {
    id: "get-started",
    title: "Get started",
    description: "Set up itemized, try the live demo, and install the mobile PWA.",
  },
  {
    id: "use",
    title: "Use itemized",
    description: "Task guides for inventory, expiration rules, barcode scanning, shopping lists, and label printing.",
  },
  {
    id: "self-host",
    title: "Self-host",
    description: "Install with Docker, Unraid, or a single binary, configure TLS, and run backup drills.",
  },
  {
    id: "integrate",
    title: "Integrate",
    description: "Automate workflows with the itemized HTTP API and connect external services.",
  },
  {
    id: "reference",
    title: "Reference",
    description: "Complete environment variable reference and configuration tables.",
  },
  {
    id: "under-the-hood",
    title: "Under the hood",
    description: "System architecture, internal Go packages, OpenSpec workflow, and contributing guides.",
  },
];

export const VALID_AUDIENCES = new Set<Audience>(["user", "admin", "developer"]);
export const VALID_ENTRY_POINTS = new Set<EntryPointId>(ENTRY_POINTS.map((e) => e.id));

export interface DocHeading {
  depth: number;
  text: string;
  id: string;
}

export interface DocLink {
  href: string;
  text: string;
}

export interface DocImage {
  src: string;
  alt: string;
}

export interface DocFrontMatter {
  title: string;
  summary: string;
  audience: Audience;
  entry_point: EntryPointId;
  order: number;
  capabilities: string[];
  screens: string[];
}

export interface ParsedDoc {
  relPath: string; // e.g. "use/label-printing.md"
  absPath: string;
  slug: string; // e.g. "use/label-printing" or "self-hosting/index"
  urlPath: string; // e.g. "use/label-printing.html"
  frontMatter: DocFrontMatter;
  rawFrontMatter: Record<string, unknown>;
  body: string;
  processedBody: string;
  html: string;
  headings: DocHeading[];
  links: DocLink[];
  images: DocImage[];
  wordCount: number;
  plainText: string;
}

export function repoRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
}

export function slugifyHeading(text: string): string {
  return text
    .toLowerCase()
    .replace(/`([^`]+)`/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/&[a-z0-9#]+;/gi, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

export function generateShortcutsMarkdown(): string {
  const rows = KEYBOARD_SHORTCUTS.map(
    (s) => `| \`${s.keys}\` | ${s.label} | ${s.description} |`
  );
  return [
    "| Shortcut | Action | Description |",
    "| --- | --- | --- |",
    ...rows,
  ].join("\n");
}

export function preprocessMarkdown(body: string): string {
  return body.replace(/<!--\s*GENERATED:SHORTCUTS\s*-->/g, generateShortcutsMarkdown());
}

export function countWords(markdown: string): number {
  const stripped = markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/[#>*_`|~-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!stripped) return 0;
  return stripped.split(" ").filter(Boolean).length;
}

export function stripHtmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export function docRelPathToUrl(relPath: string): string {
  const normalized = relPath.replace(/\\/g, "/");
  if (normalized.endsWith("/README.md")) {
    return normalized.slice(0, -"/README.md".length) + "/index.html";
  }
  if (normalized === "README.md") {
    return "index.html";
  }
  return normalized.replace(/\.md$/, ".html");
}

export function docRelPathToSlug(relPath: string): string {
  return docRelPathToUrl(relPath).replace(/\.html$/, "");
}

export function walkMarkdownFiles(docsDir: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(docsDir)) return results;
  const walk = (dir: string) => {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "assets") continue;
        walk(full);
      } else if (entry.isFile() && entry.name.endsWith(".md")) {
        results.push(full);
      }
    }
  };
  walk(docsDir);
  results.sort();
  return results;
}

export function renderMarkdown(
  markdown: string,
  rewriteHref?: (href: string) => string,
  rewriteImgSrc?: (src: string) => string
): { html: string; headings: DocHeading[]; links: DocLink[]; images: DocImage[] } {
  const headings: DocHeading[] = [];
  const links: DocLink[] = [];
  const images: DocImage[] = [];
  const seenIds = new Map<string, number>();

  const instance = new Marked({ gfm: true, breaks: false });
  const baseRenderer = new instance.Renderer();

  instance.use({
    renderer: {
      heading(token) {
        const rawText = token.text;
        const baseId = slugifyHeading(rawText);
        const count = seenIds.get(baseId) ?? 0;
        seenIds.set(baseId, count + 1);
        const id = count === 0 ? baseId : `${baseId}-${count}`;
        headings.push({ depth: token.depth, text: rawText.replace(/`([^`]+)`/g, "$1"), id });
        const rendered = baseRenderer.heading.call(this, token);
        return rendered.replace(/^<h([1-6])>/, `<h$1 id="${id}">`);
      },
      link(token) {
        links.push({ href: token.href || "", text: token.text || "" });
        const rewritten = rewriteHref ? rewriteHref(token.href || "") : token.href || "";
        return baseRenderer.link.call(this, { ...token, href: rewritten });
      },
      image(token) {
        images.push({ src: token.href || "", alt: token.text || "" });
        const rewritten = rewriteImgSrc ? rewriteImgSrc(token.href || "") : token.href || "";
        const out = baseRenderer.image.call(this, { ...token, href: rewritten });
        return out.replace(/^<img /, '<img loading="lazy" decoding="async" ');
      },
      table(token) {
        return `<div class="table-wrap" tabindex="0">${baseRenderer.table.call(this, token)}</div>`;
      },
      code(token) {
        const rendered = baseRenderer.code.call(this, token);
        return rendered.replace(/^<pre>/, '<pre tabindex="0">');
      },
    },
  });
  const html = instance.parse(markdown) as string;
  return { html, headings, links, images };
}

export function loadDocs(docsDir: string): ParsedDoc[] {
  const files = walkMarkdownFiles(docsDir);
  return files.map((absPath) => {
    const relPath = path.relative(docsDir, absPath).replace(/\\/g, "/");
    const raw = fs.readFileSync(absPath, "utf8");
    const parsed = matter(raw);
    const data = (parsed.data || {}) as Record<string, unknown>;
    const processedBody = preprocessMarkdown(parsed.content);
    const { html, headings, links, images } = renderMarkdown(processedBody);

    const frontMatter: DocFrontMatter = {
      title: typeof data.title === "string" ? data.title.trim() : "",
      summary: typeof data.summary === "string" ? data.summary.trim() : "",
      audience: (typeof data.audience === "string" ? data.audience.trim() : "") as Audience,
      entry_point: (typeof data.entry_point === "string" ? data.entry_point.trim() : "") as EntryPointId,
      order: typeof data.order === "number" ? data.order : 100,
      capabilities: Array.isArray(data.capabilities)
        ? data.capabilities.map((c) => String(c).trim()).filter(Boolean)
        : [],
      screens: Array.isArray(data.screens)
        ? data.screens.map((s) => String(s).trim()).filter(Boolean)
        : [],
    };

    return {
      relPath,
      absPath,
      slug: docRelPathToSlug(relPath),
      urlPath: docRelPathToUrl(relPath),
      frontMatter,
      rawFrontMatter: data,
      body: parsed.content,
      processedBody,
      html,
      headings,
      links,
      images,
      wordCount: countWords(processedBody),
      plainText: stripHtmlToText(html),
    };
  });
}

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

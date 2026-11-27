import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  ENTRY_POINTS,
  EntryPointMeta,
  ParsedDoc,
  docRelPathToSlug,
  docRelPathToUrl,
  escapeHtml,
  loadDocs,
  renderMarkdown,
  repoRoot,
} from "./lib";
import { generateReadmeContent } from "./readme";

const GITHUB_REPO = "https://github.com/itemizedapp/itemized";
const SITE_ORIGIN = "https://itemizedapp.com";
const DEMO_URL = "https://demo.itemizedapp.com";
const PUBLIC_DOCS_BASE = `${SITE_ORIGIN}/docs`;

export function detectDocsVersion(root: string): string {
  if (process.env.DOCS_VERSION) return process.env.DOCS_VERSION;
  try {
    const tag = execSync("git describe --tags --abbrev=0", {
      cwd: root,
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
    if (tag) return tag;
  } catch {
    // no tags yet
  }
  const pkgPath = path.join(root, "web/package.json");
  if (fs.existsSync(pkgPath)) {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8")) as { version?: string };
    if (pkg.version) return `v${pkg.version}`;
  }
  return "dev";
}

function relativePrefix(urlPath: string): string {
  const depth = urlPath.split("/").length - 1;
  return depth === 0 ? "./" : "../".repeat(depth);
}

function rewriteSiteLink(href: string, currentRelPath: string): string {
  if (!href || /^(https?:|mailto:|tel:|#)/i.test(href)) return href;
  const [rawTarget, hash] = href.split("#");
  if (!rawTarget) return href;
  const resolvedRel = path.posix.normalize(
    path.posix.join(path.posix.dirname(currentRelPath), rawTarget)
  );
  if (resolvedRel.endsWith(".md")) {
    const targetUrl = docRelPathToUrl(resolvedRel);
    const fromDir = path.posix.dirname(docRelPathToUrl(currentRelPath));
    const rel = path.posix.relative(fromDir === "." ? "" : fromDir, targetUrl) || path.posix.basename(targetUrl);
    return hash ? `${rel}#${hash}` : rel;
  }
  return href;
}

function rewriteSiteImage(src: string, currentRelPath: string): string {
  if (!src || /^(https?:|data:)/i.test(src)) return src;
  const resolvedRel = path.posix.normalize(
    path.posix.join(path.posix.dirname(currentRelPath), src)
  );
  const fromDir = path.posix.dirname(docRelPathToUrl(currentRelPath));
  return path.posix.relative(fromDir === "." ? "" : fromDir, resolvedRel);
}

function buildStylesheet(): string {
  return `:root {
  --bg: #ffffff;
  --bg-subtle: #f8fafc;
  --surface: #f1f5f9;
  --border: #cbd5e1;
  --text: #0f172a;
  --text-muted: #475569;
  --accent: #3730a3;
  --accent-hover: #312e81;
  --accent-bg: #e0e7ff;
  --code-bg: #f1f5f9;
  --focus: #4338ca;
  --font-sans: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  --font-mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}

@media (prefers-color-scheme: dark) {
  :root {
    --bg: #020617;
    --bg-subtle: #0f172a;
    --surface: #1e293b;
    --border: #334155;
    --text: #f8fafc;
    --text-muted: #cbd5e1;
    --accent: #a5b4fc;
    --accent-hover: #c7d2fe;
    --accent-bg: #1e1b4b;
    --code-bg: #0f172a;
    --focus: #818cf8;
  }
}

*, *::before, *::after { box-sizing: border-box; }
html { font-family: var(--font-sans); background: var(--bg); color: var(--text); line-height: 1.6; }
body { margin: 0; min-height: 100vh; display: flex; flex-direction: column; }

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; scroll-behavior: auto !important; }
}

a { color: var(--accent); text-underline-offset: 2px; }
a:hover { color: var(--accent-hover); }
:focus-visible { outline: 3px solid var(--focus); outline-offset: 2px; border-radius: 4px; }

.skip-link {
  position: absolute;
  left: -9999px;
  top: 0;
  background: var(--accent);
  color: #ffffff;
  padding: 0.6rem 1rem;
  font-weight: 600;
  z-index: 100;
}
@media (prefers-color-scheme: dark) {
  .skip-link { color: #020617; }
}
.skip-link:focus { left: 0.75rem; top: 0.75rem; }

.site-header {
  border-bottom: 1px solid var(--border);
  background: var(--bg-subtle);
  padding: 0.75rem 1rem;
}
.header-inner {
  max-width: 1280px;
  margin: 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  flex-wrap: wrap;
}
.brand {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  font-weight: 700;
  font-size: 1.1rem;
  color: var(--text);
  text-decoration: none;
}
.version-badge {
  font-size: 0.75rem;
  font-weight: 600;
  padding: 0.15rem 0.5rem;
  border-radius: 999px;
  background: var(--accent-bg);
  color: var(--accent);
}
.header-nav-desktop { display: flex; align-items: center; gap: 1rem; }
.header-nav-desktop a { text-decoration: none; font-weight: 500; color: var(--text); }
.header-nav-desktop a:hover { color: var(--accent); text-decoration: underline; }
.header-nav-desktop a.demo-cta {
  background: var(--accent);
  color: #ffffff;
  padding: 0.35rem 0.75rem;
  border-radius: 0.5rem;
  font-weight: 600;
}
@media (prefers-color-scheme: dark) {
  .header-nav-desktop a.demo-cta { color: #020617; }
}
.mobile-menu { display: none; }
.mobile-menu summary {
  cursor: pointer;
  list-style: none;
  padding: 0.35rem 0.65rem;
  border: 1px solid var(--border);
  border-radius: 0.5rem;
  font-weight: 600;
  color: var(--text);
}
.mobile-menu[open] .mobile-menu-panel {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-top: 0.5rem;
  padding: 0.75rem;
  border: 1px solid var(--border);
  border-radius: 0.5rem;
  background: var(--bg);
}

.layout {
  max-width: 1280px;
  width: 100%;
  margin: 0 auto;
  padding: 1.5rem 1rem 3rem;
  display: grid;
  grid-template-columns: 240px minmax(0, 1fr) 210px;
  gap: 2rem;
  flex: 1;
}
.layout.layout-landing {
  grid-template-columns: minmax(0, 1fr);
  max-width: 980px;
}

.sidebar { font-size: 0.9rem; }
.sidebar-group { margin-bottom: 1.25rem; }
.sidebar-group-title {
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-muted);
  margin: 0 0 0.4rem;
}
.sidebar ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.35rem; }
.sidebar a {
  display: block;
  padding: 0.35rem 0.5rem;
  min-height: 28px;
  border-radius: 0.375rem;
  text-decoration: none;
  color: var(--text);
}
.sidebar a:hover { background: var(--surface); }
.sidebar a[aria-current="page"] { background: var(--accent-bg); color: var(--accent); font-weight: 600; }

.toc { font-size: 0.85rem; }
.toc-title { font-size: 0.75rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); margin: 0 0 0.5rem; }
.toc ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.4rem; }
.toc a { display: inline-block; padding: 0.15rem 0; min-height: 24px; text-decoration: none; color: var(--text-muted); }
.toc a:hover { color: var(--accent); text-decoration: underline; }
.toc li.depth-3 { padding-left: 0.75rem; }

.breadcrumb { font-size: 0.85rem; color: var(--text-muted); margin-bottom: 1rem; }
.breadcrumb ol { list-style: none; padding: 0; margin: 0; display: flex; flex-wrap: wrap; gap: 0.4rem; }
.breadcrumb li::after { content: "/"; margin-left: 0.4rem; color: var(--border); }
.breadcrumb li:last-child::after { content: ""; margin: 0; }

main h1 { font-size: 2rem; line-height: 1.2; margin: 0 0 0.75rem; }
main h2 { font-size: 1.35rem; margin: 2rem 0 0.6rem; border-bottom: 1px solid var(--border); padding-bottom: 0.25rem; }
main h3 { font-size: 1.1rem; margin: 1.4rem 0 0.4rem; }
main p { margin: 0.75rem 0; }
main img { max-width: 100%; height: auto; border-radius: 0.5rem; border: 1px solid var(--border); display: block; margin: 1rem 0; }
main code { font-family: var(--font-mono); font-size: 0.88em; background: var(--code-bg); padding: 0.1rem 0.3rem; border-radius: 0.25rem; overflow-wrap: anywhere; }
main a { overflow-wrap: anywhere; }
main pre { background: var(--code-bg); border: 1px solid var(--border); padding: 0.9rem 1rem; border-radius: 0.5rem; overflow-x: auto; }
main pre code { background: none; padding: 0; font-size: 0.85rem; }
.table-wrap { overflow-x: auto; margin: 1rem 0; }
table { border-collapse: collapse; width: 100%; font-size: 0.9rem; }
th, td { border: 1px solid var(--border); padding: 0.5rem 0.65rem; text-align: left; vertical-align: top; }
th { background: var(--surface); font-weight: 600; }

.lead { font-size: 1.05rem; color: var(--text-muted); margin-top: 0; }

.search-box { margin: 1.25rem 0 1.75rem; }
.search-box label { display: block; font-weight: 600; margin-bottom: 0.35rem; }
.search-box input {
  width: 100%;
  max-width: 560px;
  padding: 0.6rem 0.85rem;
  font-size: 1rem;
  border: 1px solid var(--border);
  border-radius: 0.5rem;
  background: var(--bg);
  color: var(--text);
}
.search-status { font-size: 0.85rem; color: var(--text-muted); margin-top: 0.4rem; min-height: 1.25rem; }
.search-results { list-style: none; padding: 0; margin: 0.5rem 0 0; max-width: 640px; display: flex; flex-direction: column; gap: 0.5rem; }
.search-results a {
  display: block;
  padding: 0.65rem 0.85rem;
  border: 1px solid var(--border);
  border-radius: 0.5rem;
  background: var(--bg-subtle);
  text-decoration: none;
  color: var(--text);
}
.search-results a:hover { border-color: var(--accent); }
.search-results .res-title { font-weight: 600; color: var(--accent); display: block; }
.search-results .res-snippet { font-size: 0.85rem; color: var(--text-muted); display: block; margin-top: 0.15rem; }

.entry-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 1rem;
}
.entry-card {
  border: 1px solid var(--border);
  border-radius: 0.75rem;
  padding: 1rem 1.1rem;
  background: var(--bg-subtle);
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.entry-card h2 { margin: 0; border: none; padding: 0; font-size: 1.15rem; }
.entry-card p { margin: 0; font-size: 0.9rem; color: var(--text-muted); }
.entry-card ul { margin: 0.25rem 0 0.5rem; padding-left: 1.1rem; font-size: 0.9rem; display: flex; flex-direction: column; gap: 0.35rem; }
.entry-card ul a { display: inline-block; padding: 0.15rem 0; min-height: 24px; }
.entry-card .all-pages { margin-top: auto; font-size: 0.88rem; font-weight: 600; display: inline-block; padding: 0.2rem 0; min-height: 24px; }

.section-list { list-style: none; padding: 0; margin: 1.25rem 0; display: flex; flex-direction: column; gap: 0.85rem; }
.section-list li { border: 1px solid var(--border); border-radius: 0.5rem; padding: 0.85rem 1rem; background: var(--bg-subtle); }
.section-list a { font-weight: 600; font-size: 1.02rem; }
.section-list p { margin: 0.25rem 0 0; font-size: 0.9rem; color: var(--text-muted); }

.page-meta {
  margin-top: 2.5rem;
  padding-top: 1rem;
  border-top: 1px solid var(--border);
  display: flex;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 0.75rem;
  font-size: 0.85rem;
  color: var(--text-muted);
}

.site-footer {
  border-top: 1px solid var(--border);
  background: var(--bg-subtle);
  padding: 1.25rem 1rem;
  font-size: 0.85rem;
  color: var(--text-muted);
}
.footer-inner {
  max-width: 1280px;
  margin: 0 auto;
  display: flex;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 1rem;
}
.footer-links { display: flex; gap: 1rem; flex-wrap: wrap; }

@media (max-width: 1024px) {
  .layout { grid-template-columns: 220px minmax(0, 1fr); }
  .toc { display: none; }
}
@media (max-width: 760px) {
  .header-nav-desktop { display: none; }
  .mobile-menu { display: block; }
  .layout { grid-template-columns: minmax(0, 1fr); gap: 1.25rem; }
  .sidebar { order: 2; border-top: 1px solid var(--border); padding-top: 1rem; }
}
`;
}

function buildSearchScript(): string {
  return `(function () {
  var input = document.getElementById("docs-search-input");
  var status = document.getElementById("docs-search-status");
  var list = document.getElementById("docs-search-results");
  if (!input || !status || !list) return;

  var basePrefix = input.getAttribute("data-prefix") || "./";
  var indexPromise = null;

  function loadIndex() {
    if (!indexPromise) {
      indexPromise = fetch(basePrefix + "search-index.json").then(function (r) {
        return r.json();
      });
    }
    return indexPromise;
  }

  function escapeHtml(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function makeSnippet(text, term) {
    var lower = text.toLowerCase();
    var idx = lower.indexOf(term);
    if (idx === -1) return text.slice(0, 120) + (text.length > 120 ? "..." : "");
    var start = Math.max(0, idx - 40);
    var end = Math.min(text.length, idx + term.length + 70);
    return (start > 0 ? "..." : "") + text.slice(start, end) + (end < text.length ? "..." : "");
  }

  input.addEventListener("input", function () {
    var q = input.value.trim().toLowerCase();
    if (!q) {
      status.textContent = "";
      list.innerHTML = "";
      return;
    }
    loadIndex().then(function (entries) {
      var terms = q.split(/\\s+/).filter(Boolean);
      var matches = [];
      for (var i = 0; i < entries.length; i++) {
        var e = entries[i];
        var hay = (e.title + " " + e.summary + " " + e.section + " " + e.text).toLowerCase();
        var ok = true;
        for (var j = 0; j < terms.length; j++) {
          if (hay.indexOf(terms[j]) === -1) {
            ok = false;
            break;
          }
        }
        if (ok) matches.push(e);
      }
      var shown = matches.slice(0, 12);
      status.textContent = matches.length === 1 ? "1 result found" : matches.length + " results found";
      list.innerHTML = shown
        .map(function (m) {
          var href = basePrefix + m.url;
          var label = m.section ? m.title + " — " + m.section : m.title;
          var snippet = makeSnippet(m.text || m.summary || "", terms[0] || "");
          return '<li><a href="' + escapeHtml(href) + '"><span class="res-title">' + escapeHtml(label) + '</span><span class="res-snippet">' + escapeHtml(snippet) + "</span></a></li>";
        })
        .join("");
    });
  });
})();
`;
}

function renderShell(opts: {
  title: string;
  description: string;
  urlPath: string;
  version: string;
  sidebarHtml?: string;
  tocHtml?: string;
  mainHtml: string;
  isLanding?: boolean;
}): string {
  const prefix = relativePrefix(opts.urlPath);
  const canonicalUrl =
    opts.urlPath === "index.html"
      ? `${PUBLIC_DOCS_BASE}/`
      : opts.urlPath.endsWith("/index.html")
        ? `${PUBLIC_DOCS_BASE}/${opts.urlPath.slice(0, -"index.html".length)}`
        : `${PUBLIC_DOCS_BASE}/${opts.urlPath}`;
  const fullTitle = `${opts.title} — itemized docs`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(fullTitle)}</title>
  <meta name="description" content="${escapeHtml(opts.description)}" />
  <link rel="canonical" href="${escapeHtml(canonicalUrl)}" />
  <meta property="og:site_name" content="itemized" />
  <meta property="og:title" content="${escapeHtml(fullTitle)}" />
  <meta property="og:description" content="${escapeHtml(opts.description)}" />
  <meta property="og:image" content="${SITE_ORIGIN}/og-card.png" />
  <link rel="stylesheet" href="${prefix}assets/style.css" />
</head>
<body>
  <a class="skip-link" href="#main-content">Skip to content</a>
  <header class="site-header">
    <div class="header-inner">
      <div style="display:flex;align-items:center;gap:0.6rem;">
        <a class="brand" href="${SITE_ORIGIN}/"><span>itemized</span></a>
        <span class="version-badge">${escapeHtml(opts.version)}</span>
      </div>
      <nav class="header-nav-desktop" aria-label="Primary">
        <a href="${SITE_ORIGIN}/features/">Features</a>
        <a href="${SITE_ORIGIN}/self-host/">Self-Host</a>
        <a href="${prefix}index.html" aria-current="page">Docs</a>
        <a href="${GITHUB_REPO}" rel="noopener noreferrer">GitHub</a>
        <a class="demo-cta" href="${DEMO_URL}" rel="noopener noreferrer">Try the demo</a>
      </nav>
      <details class="mobile-menu">
        <summary>Menu</summary>
        <nav class="mobile-menu-panel" aria-label="Mobile primary">
          <a href="${SITE_ORIGIN}/features/">Features</a>
          <a href="${SITE_ORIGIN}/self-host/">Self-Host</a>
          <a href="${prefix}index.html">Docs</a>
          <a href="${DEMO_URL}" rel="noopener noreferrer">Try the demo</a>
          <a href="${GITHUB_REPO}" rel="noopener noreferrer">GitHub</a>
        </nav>
      </details>
    </div>
  </header>

  <div class="layout${opts.isLanding ? " layout-landing" : ""}">
    ${opts.sidebarHtml ? `<nav class="sidebar" aria-label="Documentation">${opts.sidebarHtml}</nav>` : ""}
    <main id="main-content" tabindex="-1">
      ${opts.mainHtml}
    </main>
    ${opts.tocHtml ? `<aside class="toc" aria-label="On this page">${opts.tocHtml}</aside>` : ""}
  </div>

  <footer class="site-footer">
    <div class="footer-inner">
      <span>itemized documentation (${escapeHtml(opts.version)})</span>
      <nav class="footer-links" aria-label="Footer">
        <a href="${prefix}index.html">Docs</a>
        <a href="${DEMO_URL}" rel="noopener noreferrer">Live Demo</a>
        <a href="${GITHUB_REPO}" rel="noopener noreferrer">GitHub</a>
      </nav>
    </div>
  </footer>
  <script src="${prefix}assets/search.js" defer></script>
</body>
</html>
`;
}

function buildSidebarHtml(docs: ParsedDoc[], currentUrlPath: string): string {
  const prefix = relativePrefix(currentUrlPath);
  return ENTRY_POINTS.map((ep) => {
    const epDocs = docs
      .filter((d) => d.frontMatter.entry_point === ep.id)
      .sort((a, b) => a.frontMatter.order - b.frontMatter.order || a.frontMatter.title.localeCompare(b.frontMatter.title));
    if (epDocs.length === 0) return "";
    const items = epDocs
      .map((d) => {
        const current = d.urlPath === currentUrlPath ? ' aria-current="page"' : "";
        return `<li><a href="${prefix}${d.urlPath}"${current}>${escapeHtml(d.frontMatter.title)}</a></li>`;
      })
      .join("");
    return `<div class="sidebar-group">
      <div class="sidebar-group-title"><a href="${prefix}${ep.id}/index.html" style="padding:0;color:inherit;">${escapeHtml(ep.title)}</a></div>
      <ul>${items}</ul>
    </div>`;
  })
    .filter(Boolean)
    .join("");
}

function buildTocHtml(doc: ParsedDoc): string {
  const items = doc.headings.filter((h) => h.depth === 2 || h.depth === 3);
  if (items.length === 0) return "";
  return `<div class="toc-title">On this page</div>
  <ul>${items
    .map((h) => `<li class="depth-${h.depth}"><a href="#${escapeHtml(h.id)}">${escapeHtml(h.text)}</a></li>`)
    .join("")}</ul>`;
}

export interface BuildResult {
  docsCount: number;
  helpPagesCount: number;
  siteDir: string;
  helpDir: string;
  readmePath: string;
}

export function generateHelpFilesContent(docs: ParsedDoc[], version: string): Map<string, string> {
  const userDocs = docs
    .filter((d) => d.frontMatter.audience === "user")
    .sort((a, b) => a.frontMatter.order - b.frontMatter.order || a.frontMatter.title.localeCompare(b.frontMatter.title));

  const userRelSet = new Set(userDocs.map((d) => d.relPath));

  const renderedPages = userDocs.map((d) => {
    const rendered = renderMarkdown(
      d.processedBody,
      (href) => {
        if (!href || /^(https?:|mailto:|tel:|#)/i.test(href)) return href;
        const [rawTarget, hash] = href.split("#");
        const resolvedRel = path.posix.normalize(
          path.posix.join(path.posix.dirname(d.relPath), rawTarget)
        );
        if (resolvedRel.endsWith(".md")) {
          if (userRelSet.has(resolvedRel)) {
            const slug = docRelPathToSlug(resolvedRel);
            return hash ? `/help/${slug}#${hash}` : `/help/${slug}`;
          }
          const siteUrl = `${PUBLIC_DOCS_BASE}/${docRelPathToUrl(resolvedRel)}`;
          return hash ? `${siteUrl}#${hash}` : siteUrl;
        }
        return href;
      },
      (src) => {
        if (!src || /^(https?:|data:)/i.test(src)) return src;
        const resolvedRel = path.posix.normalize(
          path.posix.join(path.posix.dirname(d.relPath), src)
        );
        const fileName = path.posix.basename(resolvedRel);
        return `/help-assets/${fileName}`;
      }
    );

    return {
      slug: d.slug,
      title: d.frontMatter.title,
      summary: d.frontMatter.summary,
      entryPoint: d.frontMatter.entry_point,
      order: d.frontMatter.order,
      screens: d.frontMatter.screens,
      headings: rendered.headings.filter((h) => h.depth >= 2 && h.depth <= 3),
      html: rendered.html,
      searchText: `${d.frontMatter.title} ${d.frontMatter.summary} ${d.plainText}`,
    };
  });

  const screenMap: Record<string, string> = {};
  for (const p of renderedPages) {
    for (const s of p.screens) {
      if (!screenMap[s]) {
        screenMap[s] = p.slug;
      }
    }
  }

  const taskEntries = [
    { label: "Add your first product", slug: "get-started/getting-started", external: false },
    { label: "Scan a barcode to purchase or consume", slug: "use/barcode-scanning", external: false },
    { label: "Organize locations and categories", slug: "use/locations-and-categories", external: false },
    { label: "Track expiration dates and due rules", slug: "use/inventory-and-expiration", external: false },
    { label: "Manage your shopping list", slug: "use/shopping-list", external: false },
    { label: "Print QR labels on a Zebra printer", slug: "configure/label-printing", external: false },
    { label: "Install itemized on your phone", slug: "get-started/install-pwa", external: false },
    { label: "Use keyboard shortcuts", slug: "use/search-and-shortcuts", external: false },
    { label: "Self-host itemized", slug: `${PUBLIC_DOCS_BASE}/self-hosting/index.html`, external: true },
  ];

  const out = new Map<string, string>();
  out.set(
    "index.ts",
    `// Code generated by scripts/docs/build.ts. DO NOT EDIT BY HAND.

export interface HelpHeading {
  depth: number;
  text: string;
  id: string;
}

export interface HelpPage {
  slug: string;
  title: string;
  summary: string;
  entryPoint: string;
  order: number;
  screens: string[];
  headings: HelpHeading[];
  html: string;
  searchText: string;
}

export interface HelpTaskEntry {
  label: string;
  slug: string;
  external: boolean;
}

export const HELP_VERSION = ${JSON.stringify(version)}; // x-release-please-version
export const HELP_DOCS_BASE_URL = ${JSON.stringify(PUBLIC_DOCS_BASE)};
export const HELP_TASK_ENTRIES: HelpTaskEntry[] = ${JSON.stringify(taskEntries, null, 2)};
export const HELP_SCREEN_MAP: Record<string, string> = ${JSON.stringify(screenMap, null, 2)};
export const HELP_PAGES: HelpPage[] = ${JSON.stringify(renderedPages, null, 2)};
`
  );

  return out;
}

export function buildAllDocs(root = repoRoot()): BuildResult {
  const docsDir = path.join(root, "docs");
  const siteDir = path.join(root, "dist/docs");
  const helpDir = path.join(root, "web/src/generated/help");
  const helpAssetsDir = path.join(root, "web/public/help-assets");
  const version = detectDocsVersion(root);
  const docs = loadDocs(docsDir);

  // Clean and recreate siteDir
  fs.rmSync(siteDir, { recursive: true, force: true });
  fs.mkdirSync(path.join(siteDir, "assets"), { recursive: true });
  fs.writeFileSync(path.join(siteDir, "assets/style.css"), buildStylesheet(), "utf8");
  fs.writeFileSync(path.join(siteDir, "assets/search.js"), buildSearchScript(), "utf8");

  // Copy docs/assets and top-level docs/*.jpg|png|svg to dist/docs/
  const docsAssetsDir = path.join(docsDir, "assets");
  if (fs.existsSync(docsAssetsDir)) {
    for (const file of fs.readdirSync(docsAssetsDir)) {
      const src = path.join(docsAssetsDir, file);
      if (fs.statSync(src).isFile()) {
        fs.copyFileSync(src, path.join(siteDir, "assets", file));
      }
    }
  }
  for (const file of fs.readdirSync(docsDir)) {
    if (/\.(png|jpe?g|svg|webp)$/i.test(file)) {
      fs.copyFileSync(path.join(docsDir, file), path.join(siteDir, file));
    }
  }

  // Build search index
  const searchEntries: Array<{ title: string; summary: string; section: string; url: string; text: string }> = [];

  // Render individual docs pages
  for (const doc of docs) {
    const ep: EntryPointMeta | undefined = ENTRY_POINTS.find((e) => e.id === doc.frontMatter.entry_point);
    const prefix = relativePrefix(doc.urlPath);
    const rendered = renderMarkdown(
      doc.processedBody,
      (href) => rewriteSiteLink(href, doc.relPath),
      (src) => rewriteSiteImage(src, doc.relPath)
    );

    const breadcrumbHtml = `<nav class="breadcrumb" aria-label="Breadcrumb">
      <ol>
        <li><a href="${prefix}index.html">Docs</a></li>
        ${ep ? `<li><a href="${prefix}${ep.id}/index.html">${escapeHtml(ep.title)}</a></li>` : ""}
        <li aria-current="page">${escapeHtml(doc.frontMatter.title)}</li>
      </ol>
    </nav>`;

    const editUrl = `${GITHUB_REPO}/edit/main/docs/${doc.relPath}`;
    const mainHtml = `${breadcrumbHtml}
      <h1>${escapeHtml(doc.frontMatter.title)}</h1>
      <p class="lead">${escapeHtml(doc.frontMatter.summary)}</p>
      ${rendered.html}
      <div class="page-meta">
        <span>Version: ${escapeHtml(version)}</span>
        <a href="${editUrl}" rel="noopener noreferrer">Edit this page on GitHub</a>
      </div>`;

    const fullHtml = renderShell({
      title: doc.frontMatter.title,
      description: doc.frontMatter.summary,
      urlPath: doc.urlPath,
      version,
      sidebarHtml: buildSidebarHtml(docs, doc.urlPath),
      tocHtml: buildTocHtml(doc),
      mainHtml,
    });

    const outPath = path.join(siteDir, doc.urlPath);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, fullHtml, "utf8");

    searchEntries.push({
      title: doc.frontMatter.title,
      summary: doc.frontMatter.summary,
      section: "",
      url: doc.urlPath,
      text: doc.plainText,
    });
    for (const h of doc.headings.filter((x) => x.depth === 2)) {
      searchEntries.push({
        title: doc.frontMatter.title,
        summary: doc.frontMatter.summary,
        section: h.text,
        url: `${doc.urlPath}#${h.id}`,
        text: doc.plainText,
      });
    }
  }

  // Render section index pages for all 6 entry points
  for (const ep of ENTRY_POINTS) {
    const sectionUrl = `${ep.id}/index.html`;
    const epDocs = docs
      .filter((d) => d.frontMatter.entry_point === ep.id)
      .sort((a, b) => a.frontMatter.order - b.frontMatter.order || a.frontMatter.title.localeCompare(b.frontMatter.title));
    const prefix = relativePrefix(sectionUrl);
    const mainHtml = `<nav class="breadcrumb" aria-label="Breadcrumb">
      <ol>
        <li><a href="${prefix}index.html">Docs</a></li>
        <li aria-current="page">${escapeHtml(ep.title)}</li>
      </ol>
    </nav>
    <h1>${escapeHtml(ep.title)}</h1>
    <p class="lead">${escapeHtml(ep.description)}</p>
    <ul class="section-list">
      ${epDocs
        .map(
          (d) =>
            `<li><a href="${prefix}${d.urlPath}">${escapeHtml(d.frontMatter.title)}</a><p>${escapeHtml(d.frontMatter.summary)}</p></li>`
        )
        .join("")}
    </ul>`;

    const outPath = path.join(siteDir, sectionUrl);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(
      outPath,
      renderShell({
        title: ep.title,
        description: ep.description,
        urlPath: sectionUrl,
        version,
        sidebarHtml: buildSidebarHtml(docs, sectionUrl),
        mainHtml,
      }),
      "utf8"
    );
  }

  // Render landing page (index.html)
  const landingCards = ENTRY_POINTS.map((ep) => {
    const epDocs = docs
      .filter((d) => d.frontMatter.entry_point === ep.id)
      .sort((a, b) => a.frontMatter.order - b.frontMatter.order || a.frontMatter.title.localeCompare(b.frontMatter.title));
    const keyPages = epDocs.slice(0, 4);
    return `<section class="entry-card">
      <h2>${escapeHtml(ep.title)}</h2>
      <p>${escapeHtml(ep.description)}</p>
      <ul>
        ${keyPages.map((d) => `<li><a href="./${d.urlPath}">${escapeHtml(d.frontMatter.title)}</a></li>`).join("")}
      </ul>
      <a class="all-pages" href="./${ep.id}/index.html">All ${escapeHtml(ep.title)} pages →</a>
    </section>`;
  }).join("");

  const landingMain = `<h1>itemized documentation</h1>
    <p class="lead">Self-hosted household inventory management, expiration tracking, barcode scanning, and direct Zebra ZPL label printing.</p>
    <div class="search-box">
      <label for="docs-search-input">Search documentation</label>
      <input id="docs-search-input" type="search" placeholder="Search guides, settings, API, or self-hosting..." data-prefix="./" autocomplete="off" />
      <div id="docs-search-status" class="search-status" role="status" aria-live="polite"></div>
      <ul id="docs-search-results" class="search-results"></ul>
    </div>
    <div class="entry-grid">${landingCards}</div>`;

  fs.writeFileSync(
    path.join(siteDir, "index.html"),
    renderShell({
      title: "Home",
      description: "Documentation for itemized household inventory management.",
      urlPath: "index.html",
      version,
      mainHtml: landingMain,
      isLanding: true,
    }),
    "utf8"
  );

  fs.writeFileSync(path.join(siteDir, "search-index.json"), JSON.stringify(searchEntries), "utf8");

  // Write in-app Help bundle
  fs.mkdirSync(helpDir, { recursive: true });
  const generatedHelp = generateHelpFilesContent(docs, version);
  for (const [name, content] of generatedHelp) {
    fs.writeFileSync(path.join(helpDir, name), content, "utf8");
  }

  // Copy images referenced by user-audience pages into web/public/help-assets/
  fs.rmSync(helpAssetsDir, { recursive: true, force: true });
  fs.mkdirSync(helpAssetsDir, { recursive: true });
  const userDocs = docs.filter((d) => d.frontMatter.audience === "user");
  for (const d of userDocs) {
    for (const img of d.images) {
      if (!img.src || /^(https?:|data:)/i.test(img.src)) continue;
      const absImg = path.resolve(path.dirname(d.absPath), img.src);
      if (fs.existsSync(absImg)) {
        fs.copyFileSync(absImg, path.join(helpAssetsDir, path.basename(absImg)));
      }
    }
  }

  // Generate repository README.md from docs/
  const readmePath = path.join(root, "README.md");
  fs.writeFileSync(readmePath, generateReadmeContent(docs), "utf8");

  return {
    docsCount: docs.length,
    helpPagesCount: userDocs.length,
    siteDir,
    helpDir,
    readmePath,
  };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const result = buildAllDocs();
  console.log(
    `Built docs: ${result.docsCount} website pages -> ${result.siteDir}, ${result.helpPagesCount} in-app Help pages -> ${result.helpDir}, README -> ${result.readmePath}`
  );
}

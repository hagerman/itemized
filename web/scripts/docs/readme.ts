import path from "node:path";
import { ParsedDoc } from "./lib";

interface ShowcaseShot {
  src: string;
  docRelPath: string;
  fallbackTitle: string;
  fallbackAlt: string;
}

const DESKTOP_SHOWCASE: ShowcaseShot[] = [
  {
    src: "docs/assets/scanner.png",
    docRelPath: "use/barcode-scanning.md",
    fallbackTitle: "Barcode scanning and workflows",
    fallbackAlt: "Scan / Action drawer in itemized",
  },
  {
    src: "docs/assets/shopping-list.png",
    docRelPath: "use/shopping-list.md",
    fallbackTitle: "Shopping list and minimum stock",
    fallbackAlt: "Shopping List view in itemized",
  },
  {
    src: "docs/assets/product-detail.png",
    docRelPath: "use/inventory-and-expiration.md",
    fallbackTitle: "Inventory and expiration tracking",
    fallbackAlt: "Product detail page with expiration tracking in itemized",
  },
  {
    src: "docs/assets/settings-printers.png",
    docRelPath: "use/label-printing.md",
    fallbackTitle: "Label printing and ZPL templates",
    fallbackAlt: "Label Printers configuration in itemized Settings",
  },
];

function extractFirstCodeBlock(md: string, lang: string, sourceLabel: string): string {
  const re = new RegExp("```" + lang + "\\r?\\n[\\s\\S]*?\\r?\\n```");
  const match = md.match(re);
  if (!match) {
    throw new Error(`README generator: could not find \`\`\`${lang} code block in docs/${sourceLabel}`);
  }
  return match[0].trim();
}

function extractFirstMarkdownTable(md: string, sourceLabel: string): string {
  const lines = md.split(/\r?\n/);
  const tableLines: string[] = [];
  let inTable = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
      inTable = true;
      tableLines.push(line);
    } else if (inTable) {
      break;
    }
  }

  if (tableLines.length < 2) {
    throw new Error(`README generator: could not find Markdown table in docs/${sourceLabel}`);
  }
  return tableLines.join("\n");
}

function rewriteRelativeLinksToRepoRoot(md: string, sourceRelPath: string): string {
  const sourceDir = path.posix.dirname(sourceRelPath);
  return md.replace(/(!?\[[^\]]*\]\()([^)]+)(\))/g, (full, prefix: string, rawHref: string, suffix: string) => {
    const href = rawHref.trim();
    if (!href || /^(https?:|mailto:|tel:|data:)/i.test(href)) {
      return full;
    }
    if (href.startsWith("#")) {
      return `${prefix}docs/${sourceRelPath}${href}${suffix}`;
    }
    const [target, hash] = href.split("#");
    const resolved = path.posix.normalize(path.posix.join("docs", sourceDir, target));
    return `${prefix}${hash ? `${resolved}#${hash}` : resolved}${suffix}`;
  });
}

function escapeAttr(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function findImageAlt(doc: ParsedDoc | undefined, assetFileName: string, fallback: string): string {
  if (!doc) return fallback;
  const matched = doc.images.find((img) => path.posix.basename(img.src) === assetFileName);
  return matched?.alt?.trim() || fallback;
}

export function generateReadmeContent(docs: ParsedDoc[]): string {
  const byRelPath = new Map<string, ParsedDoc>(docs.map((d) => [d.relPath, d]));

  const gettingStarted = byRelPath.get("get-started/getting-started.md");
  const installPwa = byRelPath.get("get-started/install-pwa.md");
  const selfHosting = byRelPath.get("self-hosting/README.md");
  const dockerCompose = byRelPath.get("self-hosting/docker-compose.md");
  const dockerRun = byRelPath.get("self-hosting/docker-run.md");
  const configDoc = byRelPath.get("self-hosting/configuration.md");

  if (!selfHosting || !dockerCompose || !dockerRun || !configDoc) {
    throw new Error(
      "README generator: missing required self-hosting docs (README.md, docker-compose.md, docker-run.md, configuration.md)"
    );
  }

  const heroAlt = findImageAlt(
    gettingStarted,
    "inventory.png",
    "Itemized inventory dashboard showing In Stock products, sidebar counts, and location tree"
  );

  const mobileAlt = findImageAlt(
    installPwa,
    "mobile-pwa.png",
    "Itemized running on a mobile phone with the bottom Inventory, Scan / Action, and Search dock"
  );

  // Build 2x2 desktop screenshot gallery
  const showcaseCells = DESKTOP_SHOWCASE.map((shot) => {
    const doc = byRelPath.get(shot.docRelPath);
    const title = doc?.frontMatter.title ?? shot.fallbackTitle;
    const alt = findImageAlt(doc, path.posix.basename(shot.src), shot.fallbackAlt);
    return `      <a href="docs/${shot.docRelPath}"><img src="${shot.src}" alt="${escapeAttr(alt)}" width="440" /></a><br />
      <strong><a href="docs/${shot.docRelPath}">${title}</a></strong>`;
  });

  const galleryHtml = `<table>
  <tr>
    <td align="center" width="50%">
${showcaseCells[0]}
    </td>
    <td align="center" width="50%">
${showcaseCells[1]}
    </td>
  </tr>
  <tr>
    <td align="center" width="50%">
${showcaseCells[2]}
    </td>
    <td align="center" width="50%">
${showcaseCells[3]}
    </td>
  </tr>
</table>

<p align="center">
  <a href="docs/get-started/install-pwa.md"><img src="docs/assets/mobile-pwa.png" alt="${escapeAttr(mobileAlt)}" width="260" /></a><br />
  <strong><a href="docs/get-started/install-pwa.md">${installPwa?.frontMatter.title ?? "Install itemized on your phone"}</a></strong>
</p>`;

  // Feature bullets from docs/use/*.md (excluding troubleshooting)
  const useGuides = docs
    .filter((d) => d.relPath.startsWith("use/") && d.relPath !== "use/troubleshooting.md")
    .sort((a, b) => a.frontMatter.order - b.frontMatter.order || a.frontMatter.title.localeCompare(b.frontMatter.title));

  const featureBullets = useGuides
    .map((d) => `- **[${d.frontMatter.title}](docs/${d.relPath})**: ${d.frontMatter.summary}`)
    .join("\n");

  const composeYaml = extractFirstCodeBlock(dockerCompose.processedBody, "yaml", dockerCompose.relPath);
  const dockerRunBash = extractFirstCodeBlock(dockerRun.processedBody, "bash", dockerRun.relPath);
  const platformTable = rewriteRelativeLinksToRepoRoot(
    extractFirstMarkdownTable(selfHosting.processedBody, selfHosting.relPath),
    selfHosting.relPath
  );
  const configTable = rewriteRelativeLinksToRepoRoot(
    extractFirstMarkdownTable(configDoc.processedBody, configDoc.relPath),
    configDoc.relPath
  );

  return `<!-- Generated from docs/ by \`make docs-build\`. Do not edit by hand; update files under docs/ or web/scripts/docs/readme.ts instead. -->

<p align="center">
  <img src="web/public/icon-192.png" alt="itemized logo" width="96" height="96" />
</p>

<h1 align="center">itemized</h1>

<p align="center">
  <strong>Self-hosted household inventory management, expiration tracking, barcode scanning, and direct Zebra ZPL label printing.</strong>
</p>

<p align="center">
  <a href="https://demo.itemizedapp.com"><strong>🚀 Try the Live Demo</strong></a>
  &nbsp;·&nbsp;
  <a href="docs/get-started/getting-started.md">User Guide</a>
  &nbsp;·&nbsp;
  <a href="docs/self-hosting/README.md">Self-Hosting</a>
  &nbsp;·&nbsp;
  <a href="docs/api.md">API</a>
  &nbsp;·&nbsp;
  <a href="CONTRIBUTING.md">Contributing</a>
</p>

<p align="center">
  <sub>No login required on the live demo — sample household data resets automatically every hour.</sub>
</p>

<p align="center">
  <img src="docs/assets/inventory.png" alt="${escapeAttr(heroAlt)}" width="900" />
</p>

---

## What itemized does

Itemized is designed to make tracking everything in your pantry, fridge, freezers, and storage shelves fast and effortless—from your phone at the grocery store or a desktop with a USB barcode scanner.

${featureBullets}

---

## Screenshots

${galleryHtml}

---

## Quick Start

Pre-built multi-architecture images (\`linux/amd64\` and \`linux/arm64\`) are published to GitHub Container Registry at \`ghcr.io/itemizedapp/itemized:latest\`.

### Docker Compose (Recommended)

${composeYaml}

\`\`\`bash
docker compose up -d
\`\`\`

### Docker Run

${dockerRunBash}

Open \`http://localhost:8080\` (or your reverse-proxy URL) to complete first-run administrator setup.

### Other Deployment Options

${platformTable}

---

## HTTPS & Reverse Proxy

Modern mobile browsers (including iOS Safari and Chrome/Firefox on iOS) disable camera access (\`navigator.mediaDevices\`) on plain \`http://\` LAN URLs. Serve itemized over **HTTPS** behind a reverse proxy (Caddy, nginx, Traefik, or Tailscale Serve) with \`TRUST_PROXY=true\` and \`BASE_URL=https://itemized.example.com\`.

See [Reverse proxy and TLS](docs/self-hosting/README.md#3-reverse-proxy-and-tls) for ready-to-use Caddy, nginx, and Traefik configurations.

---

## Configuration

**No environment variable is mandatory.** Settings marked **Editable in UI** can be changed anytime under **Settings → Instance Configuration**; values saved in the database take precedence over environment variable defaults. See [Configuration reference](docs/self-hosting/configuration.md) for full details.

${configTable}

---

## Development

\`\`\`bash
# Run docs checks, Go vet/tests, and frontend tests
make check

# Build full single binary (embeds web/dist)
make build

# Regenerate static docs, in-app Help, and README.md
make docs-build

# Run locally in demo mode
DEMO_MODE=true DB_PATH=/tmp/itemized-demo.db go run ./cmd/itemized

# Build Docker image locally
docker build -t itemized:local .
\`\`\`

See [CONTRIBUTING.md](CONTRIBUTING.md) for the contributor guide, architecture tour, and package map.

---

## Security

To report a security vulnerability, please see [SECURITY.md](SECURITY.md).

## License

itemized is licensed under the [GNU Affero General Public License v3.0 (AGPL-3.0)](LICENSE).
`;
}

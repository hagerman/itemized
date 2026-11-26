import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { checkDocs } from "../scripts/docs/check";
import { loadDocs } from "../scripts/docs/lib";
import { generateReadmeContent } from "../scripts/docs/readme";

function makeTempProject(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "itemized-docs-check-"));
  fs.mkdirSync(path.join(dir, "docs/assets"), { recursive: true });
  fs.mkdirSync(path.join(dir, "docs/use"), { recursive: true });
  fs.mkdirSync(path.join(dir, "docs/self-hosting"), { recursive: true });
  fs.mkdirSync(path.join(dir, "openspec/specs/sample-cap"), { recursive: true });
  fs.writeFileSync(path.join(dir, "docs/assets/shot.png"), "fake-png");
  return dir;
}

describe("docs checker validation", () => {
  it("reports missing front matter, broken anchors, missing alt text, word limit, uncovered capability, missing screen, and orphan platform page", () => {
    const dir = makeTempProject();

    // Missing front matter
    fs.writeFileSync(path.join(dir, "docs/use/no-fm.md"), "Just text without front matter.\n");

    // Broken anchor, missing alt text, and >600 words
    const longWords = Array.from({ length: 610 }, () => "word").join(" ");
    fs.writeFileSync(
      path.join(dir, "docs/use/guide.md"),
      `---
title: Guide
summary: A test guide.
audience: user
entry_point: use
order: 1
capabilities: []
screens:
  - inventory
---

![](../assets/shot.png)

See [missing section](#does-not-exist).

${longWords}
`
    );

    // Self-hosting handbook missing link to orphan platform page
    fs.writeFileSync(
      path.join(dir, "docs/self-hosting/README.md"),
      `---
title: Self-hosting
summary: Handbook.
audience: admin
entry_point: self-host
order: 1
capabilities: []
screens: []
---

Install guide.
`
    );
    fs.writeFileSync(
      path.join(dir, "docs/self-hosting/nixos.md"),
      `---
title: NixOS
summary: NixOS install.
audience: admin
entry_point: self-host
order: 2
capabilities: []
screens: []
---

NixOS steps.
`
    );

    const errors = checkDocs({
      root: dir,
      screenIds: ["inventory", "settings/printers"],
      checkStaleness: false,
      buildSite: false,
    });

    expect(errors.some((e) => e.includes("use/no-fm.md") && e.includes("title"))).toBe(true);
    expect(errors.some((e) => e.includes("use/guide.md") && e.includes("missing alt text"))).toBe(true);
    expect(errors.some((e) => e.includes("use/guide.md") && e.includes("broken anchor"))).toBe(true);
    expect(errors.some((e) => e.includes("use/guide.md") && e.includes("600-word"))).toBe(true);
    expect(errors.some((e) => e.includes("openspec/specs/sample-cap"))).toBe(true);
    expect(errors.some((e) => e.includes("settings/printers"))).toBe(true);
    expect(errors.some((e) => e.includes("self-hosting/nixos.md") && e.includes("orphan"))).toBe(true);

    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("rejects non-sentence-start Itemized while allowing sentence-start Itemized", () => {
    const dir = makeTempProject();
    fs.writeFileSync(
      path.join(dir, "docs/use/casing.md"),
      `---
title: Use Itemized right
summary: Configure itemized cleanly.
audience: user
entry_point: use
order: 1
capabilities:
  - sample-cap
screens:
  - inventory
---

![Dashboard](../assets/shot.png)

Itemized starts this sentence cleanly. However, serving Itemized mid-sentence should fail.
`
    );

    const errors = checkDocs({
      root: dir,
      screenIds: ["inventory"],
      checkStaleness: false,
      buildSite: false,
    });

    expect(errors.some((e) => e.includes("use/casing.md") && e.includes("front matter title"))).toBe(true);
    expect(errors.some((e) => e.includes("use/casing.md") && e.includes("serving Itemized"))).toBe(true);
    expect(errors.some((e) => e.includes("Itemized starts"))).toBe(false);

    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("generates README.md from docs/ with rewritten links and docs/assets/ screenshots", () => {
    const dir = makeTempProject();
    fs.mkdirSync(path.join(dir, "docs/get-started"), { recursive: true });
    fs.writeFileSync(path.join(dir, "docs/assets/inventory.png"), "png");
    fs.writeFileSync(path.join(dir, "docs/assets/scanner.png"), "png");
    fs.writeFileSync(path.join(dir, "docs/assets/shopping-list.png"), "png");
    fs.writeFileSync(path.join(dir, "docs/assets/product-detail.png"), "png");
    fs.writeFileSync(path.join(dir, "docs/assets/settings-printers.png"), "png");
    fs.writeFileSync(path.join(dir, "docs/assets/mobile-pwa.png"), "png");

    fs.writeFileSync(
      path.join(dir, "docs/get-started/getting-started.md"),
      `---
title: Getting started
summary: First steps.
audience: user
entry_point: get-started
order: 1
capabilities: [sample-cap]
screens: []
---

![Hero dashboard](../assets/inventory.png)
`
    );
    fs.writeFileSync(
      path.join(dir, "docs/get-started/install-pwa.md"),
      `---
title: Install itemized on your phone
summary: Add itemized as a mobile PWA.
audience: user
entry_point: get-started
order: 2
capabilities: []
screens: []
---

![Mobile PWA view](../assets/mobile-pwa.png)
`
    );
    fs.writeFileSync(
      path.join(dir, "docs/use/barcode-scanning.md"),
      `---
title: Barcode scanning and workflows
summary: Scan barcodes with your phone or USB scanner.
audience: user
entry_point: use
order: 1
capabilities: []
screens: []
---

![Scanner drawer](../assets/scanner.png)
`
    );
    fs.writeFileSync(
      path.join(dir, "docs/self-hosting/README.md"),
      `---
title: Self-hosting handbook
summary: Deploy itemized.
audience: admin
entry_point: self-host
order: 1
capabilities: []
screens: []
---

## 1. Install

| Platform | Guide | Best for |
| --- | --- | --- |
| Docker Compose | [Docker Compose](docker-compose.md) | Recommended |

## 3. Reverse proxy and TLS

Use HTTPS.
`
    );
    fs.writeFileSync(
      path.join(dir, "docs/self-hosting/docker-compose.md"),
      `---
title: Docker Compose
summary: Compose deploy.
audience: admin
entry_point: self-host
order: 2
capabilities: []
screens: []
---

\`\`\`yaml
services:
  itemized:
    image: ghcr.io/itemizedapp/itemized:latest
\`\`\`
`
    );
    fs.writeFileSync(
      path.join(dir, "docs/self-hosting/docker-run.md"),
      `---
title: Docker Run
summary: Single container deploy.
audience: admin
entry_point: self-host
order: 3
capabilities: []
screens: []
---

\`\`\`bash
docker run -d ghcr.io/itemizedapp/itemized:latest
\`\`\`
`
    );
    fs.writeFileSync(
      path.join(dir, "docs/self-hosting/configuration.md"),
      `---
title: Configuration reference
summary: Env vars.
audience: admin
entry_point: reference
order: 1
capabilities: []
screens: []
---

| Variable | Default | Explained in |
| --- | --- | --- |
| \`PORT\` | \`8080\` | [Self-hosting handbook](README.md) |
| \`SCAN\` | \`true\` | [Barcode scanning](../use/barcode-scanning.md) |
`
    );

    const docs = loadDocs(path.join(dir, "docs"));
    const readme = generateReadmeContent(docs);

    expect(readme).toContain('src="docs/assets/inventory.png" alt="Hero dashboard"');
    expect(readme).toContain('src="docs/assets/scanner.png"');
    expect(readme).toContain('src="docs/assets/mobile-pwa.png"');
    expect(readme).not.toContain("screenshot-inventory.jpg");
    expect(readme).toContain("[Barcode scanning and workflows](docs/use/barcode-scanning.md)");
    expect(readme).toContain("image: ghcr.io/itemizedapp/itemized:latest");
    expect(readme).toContain("docker run -d ghcr.io/itemizedapp/itemized:latest");
    expect(readme).toContain("[Docker Compose](docs/self-hosting/docker-compose.md)");
    expect(readme).toContain("[Self-hosting handbook](docs/self-hosting/README.md)");
    expect(readme).toContain("[Barcode scanning](docs/use/barcode-scanning.md)");

    // Verify staleness check catches out-of-sync README.md
    fs.writeFileSync(path.join(dir, "README.md"), "# Out of sync\n");
    const staleErrors = checkDocs({
      root: dir,
      screenIds: [],
      checkStaleness: true,
      buildSite: false,
    });
    expect(staleErrors.some((e) => e.includes("README.md: generated README.md is stale"))).toBe(true);

    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("reports stale README.md, missing images/alt text, broken links, and non-sentence-start Itemized", () => {
    const dir = makeTempProject();
    fs.writeFileSync(
      path.join(dir, "docs/use/guide.md"),
      `---
title: Guide
summary: Short guide.
audience: user
entry_point: use
order: 1
capabilities: [sample-cap]
screens: [inventory]
---

![Shot](../assets/shot.png)

## Valid Heading

Body text.
`
    );
    fs.writeFileSync(
      path.join(dir, "README.md"),
      `# itemized

<img src="docs/assets/missing.png" alt="" />

![Missing alt](docs/assets/shot.png)

See [bad doc](docs/use/does-not-exist.md) and [bad anchor](docs/use/guide.md#nope).

Running Itemized mid-sentence is flagged.
`
    );

    const errors = checkDocs({
      root: dir,
      screenIds: ["inventory"],
      checkStaleness: false,
      buildSite: false,
    });

    expect(errors.some((e) => e.includes("README.md") && e.includes("missing image file 'docs/assets/missing.png'"))).toBe(true);
    expect(errors.some((e) => e.includes("README.md") && e.includes("missing alt text"))).toBe(true);
    expect(errors.some((e) => e.includes("README.md") && e.includes("broken link 'docs/use/does-not-exist.md'"))).toBe(true);
    expect(errors.some((e) => e.includes("README.md") && e.includes("broken anchor 'docs/use/guide.md#nope'"))).toBe(true);
    expect(errors.some((e) => e.includes("README.md") && e.includes("Running Itemized"))).toBe(true);

    fs.rmSync(dir, { recursive: true, force: true });
  });
});

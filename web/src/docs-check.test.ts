import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { checkDocs } from "../scripts/docs/check";

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
});

import { describe, it, expect } from "vitest";

interface NodeFs {
  readFileSync(path: string, encoding: string): string;
}

interface NodePath {
  resolve(...segments: string[]): string;
}

const fsSpecifier = "node:fs";
const pathSpecifier = "node:path";

async function readWebFile(relativePath: string): Promise<string> {
  const [{ readFileSync }, { resolve }] = (await Promise.all([
    import(/* @vite-ignore */ fsSpecifier),
    import(/* @vite-ignore */ pathSpecifier),
  ])) as [NodeFs, NodePath];
  const cwd = (globalThis as { process?: { cwd(): string } }).process?.cwd() ?? ".";
  return readFileSync(resolve(cwd, relativePath), "utf8");
}

describe("iOS PWA full-screen configuration and input auto-zoom prevention", () => {
  it("declares iOS full-screen home-screen meta tags and apple-touch-icon in index.html", async () => {
    const indexHtml = await readWebFile("index.html");
    const doc = new DOMParser().parseFromString(indexHtml, "text/html");

    const viewport = doc.querySelector('meta[name="viewport"]')?.getAttribute("content") ?? "";
    expect(viewport).toContain("viewport-fit=cover");
    expect(viewport).not.toContain("user-scalable=no");

    expect(doc.querySelector('meta[name="apple-mobile-web-app-capable"]')?.getAttribute("content")).toBe("yes");
    expect(doc.querySelector('meta[name="mobile-web-app-capable"]')?.getAttribute("content")).toBe("yes");
    expect(doc.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]')?.getAttribute("content")).toBe(
      "black-translucent"
    );
    expect(doc.querySelector('meta[name="apple-mobile-web-app-title"]')?.getAttribute("content")).toBe("Itemized");

    const appleIcon = doc.querySelector('link[rel="apple-touch-icon"]');
    expect(appleIcon?.getAttribute("href")).toBe("/apple-touch-icon.png");
    expect(appleIcon?.getAttribute("sizes")).toBe("180x180");

    const manifest = doc.querySelector('link[rel="manifest"]');
    expect(manifest?.getAttribute("href")).toBe("/manifest.json");
  });

  it("defines unlayered 16px font-size rules for form controls on iOS and coarse touch devices", async () => {
    const indexCss = await readWebFile("src/index.css");
    // Strip the @layer base { ... } block so we assert the zoom-prevention rules live outside @layer base
    const unlayeredCss = indexCss.replace(/@layer\s+base\s*\{[\s\S]*?\n\}/, "");

    expect(unlayeredCss).toMatch(/@supports\s*\(-webkit-touch-callout:\s*none\)/);
    expect(unlayeredCss).toMatch(/@media\s*\(pointer:\s*coarse\)/);
    expect(unlayeredCss).toContain('input:not([type="checkbox"]):not([type="radio"]):not([type="range"])');
    expect(unlayeredCss).toContain("textarea");
    expect(unlayeredCss).toContain("select");
    expect(unlayeredCss).toMatch(/font-size:\s*16px/);
  });

  it("declares dark color-scheme and normalizes iOS date input width in @layer base", async () => {
    const indexCss = await readWebFile("src/index.css");
    const baseMatch = indexCss.match(/@layer\s+base\s*\{[\s\S]*?\n\}/);
    expect(baseMatch).not.toBeNull();
    const baseCss = baseMatch![0];

    expect(baseCss).toMatch(/color-scheme:\s*dark/);
    expect(baseCss).toContain('input[type="date"]');
    expect(baseCss).toMatch(/min-width:\s*0/);
    expect(baseCss).toMatch(/max-width:\s*100%/);
    expect(baseCss).toMatch(/-webkit-appearance:\s*none/);
    expect(baseCss).toMatch(/appearance:\s*none/);
    expect(baseCss).toContain('input[type="date"]::-webkit-date-and-time-value');
    expect(baseCss).toMatch(/text-align:\s*left/);
  });
});

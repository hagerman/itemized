import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawn } from "node:child_process";
import { chromium, Page } from "playwright";
import AxeBuilder from "@axe-core/playwright";
import { repoRoot } from "./lib";

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
};

async function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      if (!addr || typeof addr === "string") {
        reject(new Error("Failed to allocate port"));
        return;
      }
      const { port } = addr;
      srv.close(() => resolve(port));
    });
    srv.on("error", reject);
  });
}

function startStaticServer(rootDir: string, port: number): Promise<http.Server> {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
      let filePath = path.join(rootDir, urlPath === "/" ? "index.html" : urlPath);
      if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
        filePath = path.join(filePath, "index.html");
      }
      if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
        res.writeHead(404);
        res.end("Not Found");
        return;
      }
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
      fs.createReadStream(filePath).pipe(res);
    });
    server.listen(port, "127.0.0.1", () => resolve(server));
  });
}

async function waitForHealth(baseUrl: string, timeoutMs = 30000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${baseUrl}/up`);
      if (res.ok) return;
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Timed out waiting for ${baseUrl}/up`);
}

async function assertAxeClean(page: Page, label: string, includeSelector?: string): Promise<void> {
  let builder = new AxeBuilder({ page }).withTags(WCAG_TAGS);
  if (includeSelector) {
    builder = builder.include(includeSelector);
  }
  const results = await builder.analyze();
  if (results.violations.length > 0) {
    const summary = results.violations
      .map((v) => `${v.id} (${v.impact}): ${v.help} [${v.nodes.length} nodes: ${v.nodes.map((n) => n.target.join(" ")).join("; ")}]`)
      .join("\n  ");
    throw new Error(`WCAG 2.2 AA violations on ${label}:\n  ${summary}`);
  }
}

async function assertNoHorizontalOverflow(page: Page, label: string): Promise<void> {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  if (overflow) {
    const dims = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    }));
    throw new Error(`Horizontal overflow on ${label}: scrollWidth=${dims.scrollWidth} > innerWidth=${dims.innerWidth}`);
  }
}

async function main() {
  const root = repoRoot();
  const siteDir = path.join(root, "dist/docs");
  if (!fs.existsSync(path.join(siteDir, "index.html"))) {
    throw new Error("dist/docs/index.html missing; run 'make docs-build' first");
  }

  const staticPort = await findFreePort();
  const staticUrl = `http://127.0.0.1:${staticPort}`;
  const staticServer = await startStaticServer(siteDir, staticPort);

  const appPort = await findFreePort();
  const appUrl = `http://127.0.0.1:${appPort}`;
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "itemized-a11y-"));
  const binPath = path.join(tmpDir, "itemized-bin");
  execFileSync("go", ["build", "-o", binPath, "./cmd/itemized"], { cwd: root, stdio: "inherit" });

  const appServer = spawn(binPath, [], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(appPort),
      DB_PATH: path.join(tmpDir, "demo.db"),
      DEMO_MODE: "true",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  const browser = await chromium.launch();
  try {
    await waitForHealth(appUrl);

    // 1. Static docs website checks (light & dark themes, zero third-party requests, search, no-JS)
    for (const colorScheme of ["light", "dark"] as const) {
      const ctx = await browser.newContext({
        viewport: { width: 1280, height: 800 },
        colorScheme,
      });
      const page = await ctx.newPage();
      const thirdPartyRequests: string[] = [];
      page.on("request", (req) => {
        const u = req.url();
        if (!u.startsWith(staticUrl) && !u.startsWith("data:")) {
          thirdPartyRequests.push(u);
        }
      });

      for (const p of ["/index.html", "/use/index.html", "/configure/index.html", "/configure/label-printing.html", "/self-hosting/index.html", "/api.html"]) {
        await page.goto(`${staticUrl}${p}`, { waitUntil: "networkidle" });
        await assertAxeClean(page, `static ${p} (${colorScheme})`);
        await assertNoHorizontalOverflow(page, `static ${p} (${colorScheme} desktop)`);
      }

      // Test client-side search & aria-live announcement on landing page
      await page.goto(`${staticUrl}/index.html`, { waitUntil: "networkidle" });
      await page.fill("#docs-search-input", "freezer");
      await page.waitForFunction(() => {
        const el = document.getElementById("docs-search-status");
        return el && /result/.test(el.textContent || "");
      });

      if (thirdPartyRequests.length > 0) {
        throw new Error(`Third-party requests detected on static docs site: ${thirdPartyRequests.join(", ")}`);
      }
      await ctx.close();
    }

    // 2. Static docs website at 360px mobile width with JavaScript disabled
    const noJsCtx = await browser.newContext({
      viewport: { width: 360, height: 780 },
      javaScriptEnabled: false,
    });
    const noJsPage = await noJsCtx.newPage();
    await noJsPage.goto(`${staticUrl}/configure/label-printing.html`, { waitUntil: "domcontentloaded" });
    await noJsPage.locator("details.mobile-menu summary").click();
    const demoVisible = await noJsPage.locator("details.mobile-menu a", { hasText: "Try the demo" }).isVisible();
    if (!demoVisible) {
      throw new Error("Mobile menu links not visible with JavaScript disabled at 360px");
    }
    await assertNoHorizontalOverflow(noJsPage, "static /configure/label-printing.html (360px no-JS)");
    await noJsCtx.close();

    // 3. In-app /help and contextual Help drawer WCAG 2.2 AA check (desktop + 360px mobile)
    for (const vp of [
      { name: "desktop", width: 1280, height: 800 },
      { name: "mobile-360", width: 360, height: 780 },
    ]) {
      const appCtx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, colorScheme: "dark" });
      const appPage = await appCtx.newPage();

      await appPage.goto(`${appUrl}/help`, { waitUntil: "networkidle" });
      await appPage.waitForSelector("#help-search-input");
      await assertAxeClean(appPage, `in-app /help (${vp.name})`);
      await assertNoHorizontalOverflow(appPage, `in-app /help (${vp.name})`);

      await appPage.goto(`${appUrl}/help/configure/label-printing`, { waitUntil: "networkidle" });
      await appPage.waitForSelector("article");
      await assertAxeClean(appPage, `in-app /help/configure/label-printing (${vp.name})`);
      await assertNoHorizontalOverflow(appPage, `in-app /help/configure/label-printing (${vp.name})`);

      // Open contextual Help drawer from Settings page
      await appPage.goto(`${appUrl}/settings`, { waitUntil: "networkidle" });
      await appPage.locator('button[data-help-screen="settings/printers"]').click();
      await appPage.waitForSelector('[data-testid="contextual-help-drawer"]');
      await assertAxeClean(appPage, `contextual Help drawer (${vp.name})`, '[data-testid="contextual-help-drawer"]');
      await appCtx.close();
    }

    console.log("WCAG 2.2 AA accessibility checks passed for static docs site and in-app Help.");
  } finally {
    await browser.close();
    staticServer.close();
    appServer.kill("SIGTERM");
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import { execFileSync, spawn } from "node:child_process";
import { chromium } from "playwright";
import { repoRoot } from "./lib";

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

async function main() {
  const root = repoRoot();
  const assetsDir = path.join(root, "docs/assets");
  fs.mkdirSync(assetsDir, { recursive: true });

  const port = await findFreePort();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "itemized-shots-"));
  const dbPath = path.join(tmpDir, "demo.db");
  const baseUrl = `http://127.0.0.1:${port}`;

  const binPath = path.join(tmpDir, "itemized-bin");
  execFileSync("go", ["build", "-o", binPath, "./cmd/itemized"], { cwd: root, stdio: "inherit" });

  const server = spawn(binPath, [], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(port),
      DB_PATH: dbPath,
      DEMO_MODE: "true",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let serverLogs = "";
  server.stdout.on("data", (d) => { serverLogs += d.toString(); });
  server.stderr.on("data", (d) => { serverLogs += d.toString(); });

  try {
    await waitForHealth(baseUrl);

    const browser = await chromium.launch();
    try {
      const context = await browser.newContext({
        viewport: { width: 1280, height: 800 },
        deviceScaleFactor: 2,
      });
      const page = await context.newPage();

      const HIDE_DEMO_BANNER_CSS = `[data-testid="demo-banner"] { display: none !important; }`;

      const snap = async (url: string, fileName: string, setup?: () => Promise<void>) => {
        await page.goto(`${baseUrl}${url}`, { waitUntil: "networkidle" });
        await page.addStyleTag({ content: HIDE_DEMO_BANNER_CSS });
        await page.waitForTimeout(350);
        if (setup) {
          await setup();
          await page.waitForTimeout(250);
        }
        await page.screenshot({ path: path.join(assetsDir, fileName), fullPage: false });
        console.log(`Captured docs/assets/${fileName}`);
      };

      await snap("/", "inventory.png");
      await snap("/?status=due_soon", "due-soon.png");
      await snap("/?status=shopping_list", "shopping-list.png");

      // Open first product detail
      await page.goto(`${baseUrl}/`, { waitUntil: "networkidle" });
      const firstProductLink = page.locator('a[href^="/products/"]').first();
      const productHref = await firstProductLink.getAttribute("href");
      if (productHref) {
        await snap(productHref, "product-detail.png");
      }

      await snap("/products/new", "product-form.png");
      await snap("/locations", "locations.png");
      await snap("/categories", "categories.png");

      // Scanner drawer
      await snap("/", "scanner.png", async () => {
        await page.getByRole("button", { name: /Scan \/ Action/i }).first().click();
      });

      // Quick search
      await snap("/", "search.png", async () => {
        await page.getByRole("button", { name: /Quick Search/i }).first().click();
        await page.locator('input[placeholder="Search products..."]').fill("milk");
        await page.waitForTimeout(300);
      });

      // Settings panels (Account & Preferences, Notifications, Label Printing)
      await snap("/settings", "settings.png");
      await snap("/settings?tab=notifications", "settings-notifications.png");
      await snap("/settings?tab=printing", "settings-printers.png");

      await context.close();

      // Mobile PWA viewport
      const mobileContext = await browser.newContext({
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 2,
      });
      const mobilePage = await mobileContext.newPage();
      await mobilePage.goto(`${baseUrl}/`, { waitUntil: "networkidle" });
      await mobilePage.addStyleTag({ content: HIDE_DEMO_BANNER_CSS });
      await mobilePage.waitForTimeout(350);
      await mobilePage.screenshot({ path: path.join(assetsDir, "mobile-pwa.png"), fullPage: false });
      console.log("Captured docs/assets/mobile-pwa.png");
      await mobileContext.close();
    } finally {
      await browser.close();
    }
  } catch (err) {
    console.error("Screenshot capture failed:", err);
    if (serverLogs) console.error("Server logs:\n", serverLogs);
    process.exitCode = 1;
  } finally {
    server.kill("SIGTERM");
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

main();

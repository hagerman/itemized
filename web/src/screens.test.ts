import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { APP_SCREENS } from "./screens";

describe("APP_SCREENS registry", () => {
  it("contains unique screen IDs", () => {
    const ids = APP_SCREENS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("covers every route declared in App.tsx", () => {
    const appSource = fs.readFileSync(path.resolve(__dirname, "App.tsx"), "utf8");
    const routePaths = Array.from(appSource.matchAll(/<Route\s+path="([^"]+)"/g))
      .map((m) => m[1])
      .filter((p) => p !== "*");

    const registeredPaths = new Set(
      APP_SCREENS.filter((s) => s.kind === "route" && s.routePath).map((s) => s.routePath)
    );

    const missing = routePaths.filter((p) => !registeredPaths.has(p));
    expect(missing, `Routes missing from APP_SCREENS: ${missing.join(", ")}`).toEqual([]);
  });

  it("covers every Settings card section across SettingsPage and settings components", () => {
    const settingsFiles = [
      path.resolve(__dirname, "pages/SettingsPage.tsx"),
      path.resolve(__dirname, "components/NotificationsCard.tsx"),
    ];
    const settingsComponentsDir = path.resolve(__dirname, "components/settings");
    if (fs.existsSync(settingsComponentsDir)) {
      for (const entry of fs.readdirSync(settingsComponentsDir)) {
        if (entry.endsWith(".tsx")) {
          settingsFiles.push(path.join(settingsComponentsDir, entry));
        }
      }
    }

    const expectedSettingsIds = [
      "settings/account",
      "settings/notifications",
      "settings/api-tokens",
      "settings/instance",
      "settings/oidc",
      "settings/llm",
      "settings/users",
      "settings/printers",
      "settings/label-templates",
    ];

    const registered = new Set(APP_SCREENS.filter((s) => s.kind === "settings").map((s) => s.id));
    for (const id of expectedSettingsIds) {
      expect(registered.has(id), `Settings screen ${id} missing from APP_SCREENS`).toBe(true);
    }

    // Ensure every declared data-help-screen in Settings files is registered
    const usedInSettings = new Set<string>();
    for (const filePath of settingsFiles) {
      const source = fs.readFileSync(filePath, "utf8");
      for (const match of source.matchAll(/data-help-screen="([^"]+)"/g)) {
        usedInSettings.add(match[1]);
      }
    }
    for (const id of usedInSettings) {
      expect(registered.has(id), `Settings screen ${id} used in Settings UI is not in APP_SCREENS`).toBe(true);
    }
    for (const id of expectedSettingsIds) {
      expect(usedInSettings.has(id), `Expected Settings screen ${id} to have a Learn more button`).toBe(true);
    }
  });
});

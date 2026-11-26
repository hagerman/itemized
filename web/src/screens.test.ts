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

  it("covers every Settings card section in SettingsPage.tsx", () => {
    const settingsSource = fs.readFileSync(path.resolve(__dirname, "pages/SettingsPage.tsx"), "utf8");
    const expectedSettingsIds = [
      "settings/account",
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

    // Ensure every declared data-help-screen in SettingsPage.tsx is registered
    const usedInSettings = Array.from(settingsSource.matchAll(/data-help-screen="([^"]+)"/g)).map((m) => m[1]);
    for (const id of usedInSettings) {
      expect(registered.has(id), `Settings screen ${id} used in SettingsPage.tsx is not in APP_SCREENS`).toBe(true);
    }
  });
});

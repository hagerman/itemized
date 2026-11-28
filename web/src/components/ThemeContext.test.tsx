import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen, fireEvent } from "@testing-library/react";
import {
  DARK_THEME_COLOR,
  LIGHT_THEME_COLOR,
  THEME_STORAGE_KEY,
  ThemeProvider,
  useTheme,
} from "./ThemeContext";

function ThemeProbe() {
  const { preference, resolvedTheme, setPreference } = useTheme();
  return (
    <div>
      <span data-testid="pref">{preference}</span>
      <span data-testid="resolved">{resolvedTheme}</span>
      <button type="button" onClick={() => setPreference("light")}>
        Light
      </button>
      <button type="button" onClick={() => setPreference("dark")}>
        Dark
      </button>
      <button type="button" onClick={() => setPreference("system")}>
        System
      </button>
    </div>
  );
}

function mockMatchMedia(initialMatches: boolean) {
  let matches = initialMatches;
  const listeners = new Set<(e: MediaQueryListEvent) => void>();
  const mql = {
    get matches() {
      return matches;
    },
    media: "(prefers-color-scheme: dark)",
    onchange: null,
    addEventListener: vi.fn((event: string, cb: (e: MediaQueryListEvent) => void) => {
      if (event === "change") listeners.add(cb);
    }),
    removeEventListener: vi.fn((event: string, cb: (e: MediaQueryListEvent) => void) => {
      if (event === "change") listeners.delete(cb);
    }),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  };
  vi.stubGlobal("matchMedia", vi.fn(() => mql));
  return {
    setSystemDark(next: boolean) {
      matches = next;
      const evt = { matches: next, media: "(prefers-color-scheme: dark)" } as MediaQueryListEvent;
      listeners.forEach((cb) => cb(evt));
    },
  };
}

describe("ThemeProvider", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
    document.documentElement.classList.remove("dark");
    document.head.innerHTML = '<meta name="theme-color" content="#ffffff" />';
  });

  it("defaults to system and follows OS prefers-color-scheme reactively", () => {
    const mm = mockMatchMedia(false);

    render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>
    );

    expect(screen.getByTestId("pref").textContent).toBe("system");
    expect(screen.getByTestId("resolved").textContent).toBe("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute("content")).toBe(LIGHT_THEME_COLOR);

    act(() => {
      mm.setSystemDark(true);
    });

    expect(screen.getByTestId("resolved").textContent).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute("content")).toBe(DARK_THEME_COLOR);
  });

  it("overrides OS preference when explicitly set to light or dark and persists to localStorage", () => {
    mockMatchMedia(true);

    render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>
    );

    expect(screen.getByTestId("resolved").textContent).toBe("dark");

    fireEvent.click(screen.getByRole("button", { name: "Light" }));
    expect(screen.getByTestId("pref").textContent).toBe("light");
    expect(screen.getByTestId("resolved").textContent).toBe("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute("content")).toBe(LIGHT_THEME_COLOR);

    fireEvent.click(screen.getByRole("button", { name: "Dark" }));
    expect(screen.getByTestId("pref").textContent).toBe("dark");
    expect(screen.getByTestId("resolved").textContent).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute("content")).toBe(DARK_THEME_COLOR);
  });
});

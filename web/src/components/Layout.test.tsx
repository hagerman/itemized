import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Layout } from "./Layout";

const LocationEcho = () => {
  const loc = useLocation();
  return <div data-testid="current-url">{loc.pathname + loc.search}</div>;
};

describe("Layout sidebar hierarchy & filter toggle", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  it("renders indented short names and toggles off an already-selected location filter", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url === "/api/locations") {
          return new Response(
            JSON.stringify({
              locations: [
                { id: 1, name: "Kitchen", parent_id: null, is_freezer: false, hierarchy_name: "Kitchen" },
                { id: 2, name: "Fridge", parent_id: 1, is_freezer: false, hierarchy_name: "Kitchen > Fridge" },
              ],
            }),
            { status: 200 }
          );
        }
        if (url === "/api/categories") {
          return new Response(JSON.stringify({ categories: [] }), { status: 200 });
        }
        return new Response(JSON.stringify({ status_counts: {} }), { status: 200 });
      })
    );

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={["/?status=in_stock"]}>
          <Layout
            user={{ id: 1, email: "a@b.com", role: "admin", created_at: "", updated_at: "" }}
            onLogout={() => {}}
            title="Inventory"
          >
            <LocationEcho />
          </Layout>
        </MemoryRouter>
      </QueryClientProvider>
    );

    // Verify custom brand logo renders in sidebar
    expect(screen.getAllByTestId("brand-logo").length).toBeGreaterThanOrEqual(1);

    // Wait for indented short name "Fridge" (not "Kitchen > Fridge")
    const fridgeLink = await waitFor(() => screen.getByRole("link", { name: "Fridge" }));
    expect(screen.queryByText("Kitchen > Fridge")).not.toBeInTheDocument();
    expect(fridgeLink.style.paddingLeft).toBe("24px");

    // First click selects location_id=2
    fireEvent.click(fridgeLink);
    expect(screen.getByTestId("current-url").textContent).toBe("/?status=in_stock&location_id=2");

    // Second click on already-selected Fridge clears location_id while keeping status=in_stock
    fireEvent.click(fridgeLink);
    expect(screen.getByTestId("current-url").textContent).toBe("/?status=in_stock");

    // Verify shell uses dynamic viewport height, top safe-area inset, and solid non-blurred header for iOS
    const header = screen.getByRole("banner");
    expect(header.className).toContain("pt-[env(safe-area-inset-top)]");
    expect(header.className).toContain("bg-slate-900");
    expect(header.className).not.toContain("backdrop-blur");
    expect(header.className).not.toContain("bg-slate-900/70");
    expect(header.closest("div.h-dvh")).not.toBeNull();

    // Verify mobile bottom dock expands height for bottom safe-area inset instead of squishing inside fixed h-16
    const mobileNav = screen.getByRole("navigation", { name: "Mobile navigation" });
    expect(mobileNav.className).toContain("h-[calc(4rem+env(safe-area-inset-bottom))]");
    expect(mobileNav.className).toContain("pb-[env(safe-area-inset-bottom)]");
    expect(mobileNav.className).not.toMatch(/\bh-16\b/);

    // Verify sidebar footer includes bottom safe-area inset padding for mobile drawer
    const settingsLink = screen.getByRole("link", { name: "a@b.com" });
    const sidebarFooter = settingsLink.closest("div.border-t");
    expect(sidebarFooter?.className).toContain("pb-[calc(0.75rem+env(safe-area-inset-bottom))]");
  });

  it("closes Quick Search and Keyboard Shortcuts modals on backdrop click while keeping them open on inside clicks", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url === "/api/locations") {
          return new Response(JSON.stringify({ locations: [] }), { status: 200 });
        }
        if (url === "/api/categories") {
          return new Response(JSON.stringify({ categories: [] }), { status: 200 });
        }
        return new Response(JSON.stringify({ products: [], status_counts: {} }), { status: 200 });
      })
    );

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={["/"]}>
          <Layout
            user={{ id: 1, email: "a@b.com", role: "admin", created_at: "", updated_at: "" }}
            onLogout={() => {}}
            title="Inventory"
          >
            <div>Main Content</div>
          </Layout>
        </MemoryRouter>
      </QueryClientProvider>
    );

    // Open Quick Search modal
    const searchButtons = screen.getAllByRole("button", { name: /Search/i });
    fireEvent.click(searchButtons[0]);
    const searchDialog = screen.getByRole("dialog", { name: "Quick Search" });
    const searchInput = screen.getByPlaceholderText("Search products...");

    fireEvent.mouseDown(searchInput);
    fireEvent.click(searchInput);
    expect(screen.getByRole("dialog", { name: "Quick Search" })).toBeInTheDocument();

    fireEvent.mouseDown(searchDialog);
    fireEvent.click(searchDialog);
    expect(screen.queryByRole("dialog", { name: "Quick Search" })).not.toBeInTheDocument();

    // Open Keyboard Shortcuts modal via "?" key
    fireEvent.keyDown(window, { key: "?" });
    const helpDialog = screen.getByRole("dialog", { name: "Keyboard Shortcuts" });
    const helpHeading = screen.getByText("Keyboard Shortcuts");

    fireEvent.mouseDown(helpHeading);
    fireEvent.click(helpHeading);
    expect(screen.getByRole("dialog", { name: "Keyboard Shortcuts" })).toBeInTheDocument();

    fireEvent.mouseDown(helpDialog);
    fireEvent.click(helpDialog);
    expect(screen.queryByRole("dialog", { name: "Keyboard Shortcuts" })).not.toBeInTheDocument();
  });

  it("highlights active Inventory and Search tabs in mobile bottom dock and links Search to /search", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url === "/api/locations") {
          return new Response(JSON.stringify({ locations: [] }), { status: 200 });
        }
        if (url === "/api/categories") {
          return new Response(JSON.stringify({ categories: [] }), { status: 200 });
        }
        return new Response(JSON.stringify({ status_counts: {} }), { status: 200 });
      })
    );

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { unmount } = render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={["/"]}>
          <Layout
            user={{ id: 1, email: "a@b.com", role: "admin", created_at: "", updated_at: "" }}
            onLogout={() => {}}
            title="Inventory"
          >
            <LocationEcho />
          </Layout>
        </MemoryRouter>
      </QueryClientProvider>
    );

    const mobileNav = screen.getByRole("navigation", { name: "Mobile navigation" });
    const inventoryLink = mobileNav.querySelector('a[href="/"]') as HTMLAnchorElement;
    const searchLink = mobileNav.querySelector('a[href="/search"]') as HTMLAnchorElement;

    expect(inventoryLink).not.toBeNull();
    expect(searchLink).not.toBeNull();

    // On "/": Inventory is active via foreground color (no background fill), Search is inactive
    expect(inventoryLink).toHaveAttribute("aria-current", "page");
    expect(inventoryLink.className).toContain("text-indigo-400");
    expect(inventoryLink.className).toContain("font-semibold");
    expect(inventoryLink.className).not.toContain("bg-indigo-600/20");
    expect(searchLink).not.toHaveAttribute("aria-current");
    expect(searchLink.className).toContain("text-slate-400");
    expect(searchLink.className).not.toContain("text-indigo-400");
    expect(searchLink.className).not.toContain("bg-indigo-600/20");

    // Clicking Search navigates to /search without opening a modal and highlights Search via foreground color
    fireEvent.click(searchLink);
    expect(screen.getByTestId("current-url").textContent).toBe("/search");
    expect(screen.queryByRole("dialog", { name: "Quick Search" })).not.toBeInTheDocument();
    expect(searchLink).toHaveAttribute("aria-current", "page");
    expect(searchLink.className).toContain("text-indigo-400");
    expect(searchLink.className).toContain("font-semibold");
    expect(searchLink.className).not.toContain("bg-indigo-600/20");
    expect(inventoryLink).not.toHaveAttribute("aria-current");
    expect(inventoryLink.className).toContain("text-slate-400");
    expect(inventoryLink.className).not.toContain("text-indigo-400");
    expect(inventoryLink.className).not.toContain("bg-indigo-600/20");

    unmount();

    // On "/settings": neither Inventory nor Search is active
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={["/settings"]}>
          <Layout
            user={{ id: 1, email: "a@b.com", role: "admin", created_at: "", updated_at: "" }}
            onLogout={() => {}}
            title="Settings"
          >
            <LocationEcho />
          </Layout>
        </MemoryRouter>
      </QueryClientProvider>
    );

    const settingsNav = screen.getByRole("navigation", { name: "Mobile navigation" });
    const settingsInventory = settingsNav.querySelector('a[href="/"]') as HTMLAnchorElement;
    const settingsSearch = settingsNav.querySelector('a[href="/search"]') as HTMLAnchorElement;
    expect(settingsInventory).not.toHaveAttribute("aria-current");
    expect(settingsInventory.className).not.toContain("text-indigo-400");
    expect(settingsInventory.className).not.toContain("bg-indigo-600/20");
    expect(settingsSearch).not.toHaveAttribute("aria-current");
    expect(settingsSearch.className).not.toContain("text-indigo-400");
    expect(settingsSearch.className).not.toContain("bg-indigo-600/20");
  });

  it("retains the chosen Scan / Action mode across closes and reloads while resetting transient state", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url === "/api/locations") {
          return new Response(
            JSON.stringify({
              locations: [{ id: 1, name: "Fridge", parent_id: null, is_freezer: false, hierarchy_name: "Fridge" }],
            }),
            { status: 200 }
          );
        }
        if (url === "/api/categories") {
          return new Response(JSON.stringify({ categories: [] }), { status: 200 });
        }
        if (url === "/api/scan/resolve") {
          return new Response(JSON.stringify({ kind: "unknown", barcode: "049000028904" }), { status: 200 });
        }
        return new Response(JSON.stringify({ status_counts: {}, products: [] }), { status: 200 });
      })
    );

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { unmount } = render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={["/"]}>
          <Layout
            user={{ id: 1, email: "a@b.com", role: "admin", created_at: "", updated_at: "" }}
            onLogout={() => {}}
            title="Inventory"
          >
            <div>Main Content</div>
          </Layout>
        </MemoryRouter>
      </QueryClientProvider>
    );

    // Open Scan / Action, switch to Consume, trigger unknown barcode association state
    const scanButtons = screen.getAllByRole("button", { name: /Scan \/ Action/i });
    fireEvent.click(scanButtons[0]);
    fireEvent.click(screen.getByRole("button", { name: "Consume" }));

    const scanInput = screen.getByLabelText("Barcode or search input");
    fireEvent.change(scanInput, { target: { value: "049000028904" } });
    fireEvent.submit(scanInput.closest("form")!);
    await waitFor(() => expect(screen.getByText(/Unrecognized barcode 049000028904/)).toBeInTheDocument());

    // Close and reopen via Scan / Action -> stays in Consume mode, transient banner/association cleared
    fireEvent.click(screen.getByRole("button", { name: "Close scanner" }));
    fireEvent.click(scanButtons[0]);

    expect(screen.getByRole("button", { name: "Consume" }).className).toContain("bg-indigo-600");
    expect(screen.queryByText(/Unrecognized barcode 049000028904/)).not.toBeInTheDocument();

    // Unmount and remount Layout (simulating browser reload) -> Scan / Action still opens in Consume mode
    unmount();
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={["/"]}>
          <Layout
            user={{ id: 1, email: "a@b.com", role: "admin", created_at: "", updated_at: "" }}
            onLogout={() => {}}
            title="Inventory"
          >
            <div>Main Content</div>
          </Layout>
        </MemoryRouter>
      </QueryClientProvider>
    );

    fireEvent.click(screen.getAllByRole("button", { name: /Scan \/ Action/i })[0]);
    expect(screen.getByRole("button", { name: "Consume" }).className).toContain("bg-indigo-600");
  });

  it("renders demo banner with reset countdown and hides logout button when demoMode is active", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url === "/api/locations") {
          return new Response(JSON.stringify({ locations: [] }), { status: 200 });
        }
        if (url === "/api/categories") {
          return new Response(JSON.stringify({ categories: [] }), { status: 200 });
        }
        return new Response(JSON.stringify({ status_counts: {} }), { status: 200 });
      })
    );

    const futureReset = new Date(Date.now() + 25 * 60 * 1000).toISOString();
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={["/"]}>
          <Layout
            user={{ id: 1, email: "demo@itemizedapp.com", role: "admin", created_at: "", updated_at: "" }}
            onLogout={() => {}}
            title="Inventory"
            demoMode={true}
            demoResetAt={futureReset}
          >
            <div>Main Content</div>
          </Layout>
        </MemoryRouter>
      </QueryClientProvider>
    );

    const banner = screen.getByTestId("demo-banner");
    expect(banner).toBeInTheDocument();
    expect(banner.textContent).toContain("Demo Mode");
    expect(banner.textContent).toMatch(/resets in \d+m/i);
    expect(screen.queryByRole("button", { name: "Logout" })).not.toBeInTheDocument();
  });

  it("drives keyboard shortcuts modal from KEYBOARD_SHORTCUTS and navigates to /help on g ?", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url === "/api/locations") return new Response(JSON.stringify({ locations: [] }), { status: 200 });
        if (url === "/api/categories") return new Response(JSON.stringify({ categories: [] }), { status: 200 });
        return new Response(JSON.stringify({ status_counts: {} }), { status: 200 });
      })
    );

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={["/"]}>
          <Layout
            user={{ id: 1, email: "a@b.com", role: "admin", created_at: "", updated_at: "" }}
            onLogout={() => {}}
            title="Inventory"
          >
            <LocationEcho />
          </Layout>
        </MemoryRouter>
      </QueryClientProvider>
    );

    // Press '?' to open Keyboard Shortcuts modal
    fireEvent.keyDown(window, { key: "?" });
    expect(screen.getByRole("heading", { name: "Keyboard Shortcuts" })).toBeInTheDocument();
    expect(screen.getByText("g ?")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Open full Help guide/i })).toHaveAttribute("href", "/help");

    // Close modal with Escape
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("heading", { name: "Keyboard Shortcuts" })).not.toBeInTheDocument();

    // Press 'g' then '?' to navigate to /help
    fireEvent.keyDown(window, { key: "g" });
    fireEvent.keyDown(window, { key: "?" });
    expect(screen.getByTestId("current-url").textContent).toBe("/help");
  });

  it("aligns sidebar footer Help and account settings links with matching padding, icons, and active states", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url === "/api/locations") return new Response(JSON.stringify({ locations: [] }), { status: 200 });
        if (url === "/api/categories") return new Response(JSON.stringify({ categories: [] }), { status: 200 });
        return new Response(JSON.stringify({ status_counts: {} }), { status: 200 });
      })
    );

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { unmount } = render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={["/help"]}>
          <Layout
            user={{ id: 1, email: "very.long.user.email@example.com", role: "admin", created_at: "", updated_at: "" }}
            onLogout={() => {}}
            title="Help"
          >
            <div>Main Content</div>
          </Layout>
        </MemoryRouter>
      </QueryClientProvider>
    );

    const helpLink = screen.getByRole("link", { name: "Help" });
    const settingsLink = screen.getByRole("link", { name: "very.long.user.email@example.com" });
    const logoutBtn = screen.getByRole("button", { name: "Logout" });
    const sidebarFooter = settingsLink.closest("div.border-t");

    for (const cls of ["px-2", "py-1.5", "rounded-lg", "gap-2"]) {
      expect(helpLink.className).toContain(cls);
      expect(settingsLink.className).toContain(cls);
    }
    expect(settingsLink.className).toContain("min-w-0");
    expect(settingsLink.className).toContain("flex-1");
    expect(helpLink.querySelector("svg")?.getAttribute("class")).toContain("shrink-0");
    expect(settingsLink.querySelector("svg")?.getAttribute("class")).toContain("shrink-0");
    expect(logoutBtn.className).toContain("shrink-0");
    expect(sidebarFooter?.className).toContain("pb-[calc(0.75rem+env(safe-area-inset-bottom))]");

    // On /help: Help is active, Settings is inactive
    expect(helpLink.className).toContain("bg-indigo-600/20");
    expect(helpLink.className).toContain("text-indigo-300");
    expect(settingsLink.className).not.toContain("bg-indigo-600/20");

    unmount();

    // On /settings: Settings is active, Help is inactive
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={["/settings"]}>
          <Layout
            user={{ id: 1, email: "very.long.user.email@example.com", role: "admin", created_at: "", updated_at: "" }}
            onLogout={() => {}}
            title="Settings"
          >
            <div>Main Content</div>
          </Layout>
        </MemoryRouter>
      </QueryClientProvider>
    );

    const helpLinkOnSettings = screen.getByRole("link", { name: "Help" });
    const settingsLinkOnSettings = screen.getByRole("link", { name: "very.long.user.email@example.com" });
    expect(settingsLinkOnSettings.className).toContain("bg-indigo-600/20");
    expect(settingsLinkOnSettings.className).toContain("text-indigo-300");
    expect(helpLinkOnSettings.className).not.toContain("bg-indigo-600/20");
  });
});

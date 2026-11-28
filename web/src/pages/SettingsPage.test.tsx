import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SettingsPage } from "./SettingsPage";
import { PrinterRecord, User } from "../api";
import { ThemeProvider } from "../components/ThemeContext";

const MEMBER_USER: User = {
  id: 2,
  email: "member@home.local",
  role: "member",
  created_at: "2026-11-23T00:00:00Z",
  updated_at: "2026-11-23T00:00:00Z",
};

const ADMIN_USER: User = {
  id: 1,
  email: "admin@home.local",
  role: "admin",
  created_at: "2026-11-23T00:00:00Z",
  updated_at: "2026-11-23T00:00:00Z",
};

const LocationProbe = () => {
  const location = useLocation();
  return <div data-testid="location-probe">{`${location.pathname}${location.search}`}</div>;
};

function renderSettings(
  user: User,
  options: { demoMode?: boolean; initialEntry?: string; withTheme?: boolean } = {}
) {
  const { demoMode = false, initialEntry = "/settings", withTheme = false } = options;
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const content = (
    <MemoryRouter initialEntries={[initialEntry]}>
      <LocationProbe />
      <SettingsPage user={user} demoMode={demoMode} />
    </MemoryRouter>
  );
  const result = render(
    <QueryClientProvider client={qc}>
      {withTheme ? <ThemeProvider>{content}</ThemeProvider> : content}
    </QueryClientProvider>
  );
  return { ...result, qc };
}

function getDesktopNav() {
  return screen.getByRole("navigation", { name: "Settings navigation" });
}

describe("SettingsPage role-based visibility and navigation", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("shows only Personal panels, falls back from admin tab URLs, and skips admin API calls for member users", () => {
    const fetchMock = vi.fn(async (_url: string) => new Response(JSON.stringify({ tokens: [] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    renderSettings(MEMBER_USER, { initialEntry: "/settings?tab=printing" });

    const nav = getDesktopNav();
    expect(within(nav).getByText("Personal")).toBeInTheDocument();
    expect(within(nav).getByRole("button", { name: "Account & Preferences" })).toHaveAttribute("aria-current", "page");
    expect(within(nav).getByRole("button", { name: "Notifications" })).toBeInTheDocument();
    expect(within(nav).getByRole("button", { name: "API Tokens" })).toBeInTheDocument();
    expect(within(nav).queryByText("Admin")).not.toBeInTheDocument();
    expect(within(nav).queryByRole("button", { name: "General" })).not.toBeInTheDocument();
    expect(within(nav).queryByRole("button", { name: "Users & SSO" })).not.toBeInTheDocument();
    expect(within(nav).queryByRole("button", { name: "AI & Classification" })).not.toBeInTheDocument();
    expect(within(nav).queryByRole("button", { name: "Label Printing" })).not.toBeInTheDocument();

    // Falls back to Account & Preferences
    expect(screen.getByRole("heading", { name: "Account" })).toBeInTheDocument();
    expect(screen.getByDisplayValue("member@home.local")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Label Printers" })).not.toBeInTheDocument();

    // Mobile custom grouped dropdown shows only Personal group for members
    const mobileTrigger = screen.getByRole("button", { name: "Settings section" });
    expect(mobileTrigger).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(mobileTrigger);
    expect(mobileTrigger).toHaveAttribute("aria-expanded", "true");
    const mobileMenu = screen.getByRole("menu", { name: "Settings section" });
    expect(within(mobileMenu).getByText("Personal")).toBeInTheDocument();
    expect(within(mobileMenu).queryByText("Admin")).not.toBeInTheDocument();
    expect(within(mobileMenu).getByRole("menuitemradio", { name: "Account & Preferences" })).toHaveAttribute(
      "aria-checked",
      "true"
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu", { name: "Settings section" })).not.toBeInTheDocument();

    const calledUrls = fetchMock.mock.calls.map(([u]) => String(u));
    expect(calledUrls).not.toContain("/api/settings");
    expect(calledUrls).not.toContain("/api/users");
    expect(calledUrls).not.toContain("/api/printers");
    expect(calledUrls).not.toContain("/api/label-templates");
  });

  it("switches Settings panels, syncs URL query param, and shows all Admin panels for admin users", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url === "/api/settings") {
        return new Response(
          JSON.stringify({
            base_url: "https://itemized.example.com",
            due_date_average_count: 3,
            oidc_issuer: "",
            oidc_client_id: "",
            oidc_has_secret: false,
            oidc_auto_provision: false,
            oidc_force: false,
            llm_provider: "",
            llm_model: "",
            llm_base_url: "",
            llm_has_api_key: false,
          }),
          { status: 200 }
        );
      }
      if (url === "/api/users") {
        return new Response(JSON.stringify({ users: [ADMIN_USER] }), { status: 200 });
      }
      if (url === "/api/printers") {
        return new Response(JSON.stringify({ printers: [] }), { status: 200 });
      }
      if (url === "/api/label-templates") {
        return new Response(
          JSON.stringify({
            templates: [{ entity_type: "item", content: "^XA^XZ", is_custom: false, default_content: "^XA^XZ" }],
          }),
          { status: 200 }
        );
      }
      return new Response(JSON.stringify({}), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    renderSettings(ADMIN_USER);

    const nav = getDesktopNav();
    expect(within(nav).getByText("Personal")).toBeInTheDocument();
    expect(within(nav).getByText("Admin")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Account" })).toBeInTheDocument();

    // Switch to Label Printing
    fireEvent.click(within(nav).getByRole("button", { name: "Label Printing" }));
    expect(screen.getByTestId("location-probe")).toHaveTextContent("/settings?tab=printing");
    expect(within(nav).getByRole("button", { name: "Label Printing" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("heading", { name: "Label Printers" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "ZPL Label Templates" })).toBeInTheDocument();

    // Switch to General
    fireEvent.click(within(nav).getByRole("button", { name: "General" }));
    expect(screen.getByTestId("location-probe")).toHaveTextContent("/settings?tab=general");
    expect(screen.getByRole("heading", { name: "Instance Configuration" })).toBeInTheDocument();

    // Switch to Users & SSO
    fireEvent.click(within(nav).getByRole("button", { name: "Users & SSO" }));
    expect(screen.getByTestId("location-probe")).toHaveTextContent("/settings?tab=users-sso");
    expect(screen.getByRole("heading", { name: "Household Users" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "OIDC Single Sign-On (Optional)" })).toBeInTheDocument();

    // Switch to AI & Classification
    fireEvent.click(within(nav).getByRole("button", { name: "AI & Classification" }));
    expect(screen.getByTestId("location-probe")).toHaveTextContent("/settings?tab=ai");
    expect(screen.getByRole("heading", { name: "LLM Product Classification (Optional)" })).toBeInTheDocument();

    // Mobile custom grouped dropdown preserves Personal and Admin groups and switches panels
    const mobileTrigger = screen.getByRole("button", { name: "Settings section" });
    fireEvent.click(mobileTrigger);
    const mobileMenu = screen.getByRole("menu", { name: "Settings section" });
    expect(within(mobileMenu).getByText("Personal")).toBeInTheDocument();
    expect(within(mobileMenu).getByText("Admin")).toBeInTheDocument();
    expect(within(mobileMenu).getByRole("menuitemradio", { name: "AI & Classification" })).toHaveAttribute(
      "aria-checked",
      "true"
    );
    fireEvent.click(within(mobileMenu).getByRole("menuitemradio", { name: "Notifications" }));
    expect(screen.queryByRole("menu", { name: "Settings section" })).not.toBeInTheDocument();
    expect(screen.getByTestId("location-probe")).toHaveTextContent("/settings?tab=notifications");
    expect(screen.getByRole("heading", { name: "Push Notifications" })).toBeInTheDocument();

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/settings", expect.any(Object));
      expect(fetchMock).toHaveBeenCalledWith("/api/users", expect.any(Object));
      expect(fetchMock).toHaveBeenCalledWith("/api/printers", expect.any(Object));
      expect(fetchMock).toHaveBeenCalledWith("/api/label-templates", expect.any(Object));
    });
  });

  it("allows admins to promote/demote users and save OIDC, General, and AI settings independently", async () => {
    const patchPayloads: Array<Record<string, unknown>> = [];
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api/settings" && (!init?.method || init.method === "GET")) {
        return new Response(
          JSON.stringify({
            base_url: "https://itemized.example.com",
            due_date_average_count: 3,
            oidc_issuer: "",
            oidc_client_id: "",
            oidc_has_secret: false,
            oidc_auto_provision: false,
            oidc_force: false,
            llm_provider: "",
            llm_model: "",
            llm_base_url: "",
            llm_has_api_key: false,
          }),
          { status: 200 }
        );
      }
      if (url === "/api/settings" && init?.method === "PATCH") {
        const body = JSON.parse(String(init.body));
        patchPayloads.push(body);
        return new Response(JSON.stringify({ ...body }), { status: 200 });
      }
      if (url === "/api/users") {
        return new Response(JSON.stringify({ users: [ADMIN_USER, MEMBER_USER] }), { status: 200 });
      }
      if (url === "/api/users/2" && init?.method === "PATCH") {
        return new Response(JSON.stringify({ user: { ...MEMBER_USER, role: "admin" } }), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    renderSettings(ADMIN_USER, { initialEntry: "/settings?tab=users-sso" });

    // Other user has role selector; current admin does not
    const roleSelect = await screen.findByLabelText("Role for member@home.local");
    expect(screen.queryByLabelText("Role for admin@home.local")).not.toBeInTheDocument();

    fireEvent.change(roleSelect, { target: { value: "admin" } });
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/users/2",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ role: "admin" }),
        })
      );
    });

    // Both OIDC checkboxes disabled until issuer and client ID are populated
    const autoProvCheckbox = screen.getByLabelText(/Auto-provision new household members on OIDC login/i) as HTMLInputElement;
    const forceCheckbox = screen.getByLabelText(/Force OIDC login/i) as HTMLInputElement;
    expect(autoProvCheckbox).toBeDisabled();
    expect(forceCheckbox).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText("Issuer URL"), {
      target: { value: "https://idp.example.com" },
    });
    fireEvent.change(screen.getByPlaceholderText("Client ID"), {
      target: { value: "itemized" },
    });
    expect(autoProvCheckbox).not.toBeDisabled();
    expect(forceCheckbox).not.toBeDisabled();

    fireEvent.click(forceCheckbox);
    fireEvent.click(screen.getByRole("button", { name: "Save OIDC Settings" }));

    await waitFor(() => {
      expect(patchPayloads).toHaveLength(1);
    });
    expect(patchPayloads[0]).toEqual({
      oidc_issuer: "https://idp.example.com",
      oidc_client_id: "itemized",
      oidc_auto_provision: "false",
      oidc_force: "true",
    });

    // Save General independently
    const nav = getDesktopNav();
    fireEvent.click(within(nav).getByRole("button", { name: "General" }));
    const baseUrlInput = await screen.findByLabelText(/Base URL/i);
    fireEvent.change(baseUrlInput, { target: { value: "https://pantry.example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Save General Settings" }));

    await waitFor(() => {
      expect(patchPayloads).toHaveLength(2);
    });
    expect(patchPayloads[1]).toEqual({
      base_url: "https://pantry.example.com",
      due_date_average_count: 3,
    });

    // Save AI & Classification independently
    fireEvent.click(within(nav).getByRole("button", { name: "AI & Classification" }));
    fireEvent.change(screen.getByLabelText("LLM Provider"), { target: { value: "openai" } });
    fireEvent.change(screen.getByPlaceholderText("Model name"), { target: { value: "gpt-4o-mini" } });
    fireEvent.click(screen.getByRole("button", { name: "Save AI Settings" }));

    await waitFor(() => {
      expect(patchPayloads).toHaveLength(3);
    });
    expect(patchPayloads[2]).toEqual({
      llm_provider: "openai",
      llm_model: "gpt-4o-mini",
      llm_base_url: "",
    });
  });

  it("disables Account, OIDC, and LLM controls and shows a demo notice when demoMode is active", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url === "/api/settings") {
        return new Response(
          JSON.stringify({
            base_url: "https://demo.itemizedapp.com",
            due_date_average_count: 3,
            oidc_issuer: "",
            oidc_client_id: "",
            oidc_has_secret: false,
            oidc_auto_provision: false,
            oidc_force: false,
            llm_provider: "",
            llm_model: "",
            llm_base_url: "",
            llm_has_api_key: false,
          }),
          { status: 200 }
        );
      }
      if (url === "/api/users") {
        return new Response(JSON.stringify({ users: [ADMIN_USER] }), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    renderSettings(ADMIN_USER, { demoMode: true });

    expect(screen.getByText(/Demo mode is active/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Update Account" })).toBeDisabled();

    const nav = getDesktopNav();
    fireEvent.click(within(nav).getByRole("button", { name: "Users & SSO" }));
    expect(screen.getByPlaceholderText("Issuer URL")).toBeDisabled();
    expect(screen.getByPlaceholderText("Client ID")).toBeDisabled();

    fireEvent.click(within(nav).getByRole("button", { name: "AI & Classification" }));
    expect(screen.getByPlaceholderText("Model name")).toBeDisabled();
    expect(screen.getByPlaceholderText("Base URL (optional)")).toBeDisabled();
  });

  it("invalidates auth-status when adding or deleting a printer", async () => {
    let printers: PrinterRecord[] = [
      {
        id: 1,
        name: "Kitchen Zebra",
        description: null,
        driver: "raw_tcp_zpl",
        endpoint: "192.168.1.50:9100",
        printer_model: null,
        enabled: true,
      },
    ];
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api/settings") {
        return new Response(
          JSON.stringify({
            base_url: "https://itemized.example.com",
            due_date_average_count: 3,
            oidc_issuer: "",
            oidc_client_id: "",
            oidc_has_secret: false,
            oidc_auto_provision: false,
            oidc_force: false,
            llm_provider: "",
            llm_model: "",
            llm_base_url: "",
            llm_has_api_key: false,
          }),
          { status: 200 }
        );
      }
      if (url === "/api/printers" && (!init?.method || init.method === "GET")) {
        return new Response(JSON.stringify({ printers }), { status: 200 });
      }
      if (url === "/api/printers" && init?.method === "POST") {
        printers = [
          ...printers,
          {
            id: 2,
            name: "Garage Zebra",
            description: null,
            driver: "ipp_zpl",
            endpoint: "http://192.168.1.51:631/ipp/print",
            printer_model: null,
            enabled: true,
          },
        ];
        return new Response(JSON.stringify({ printer: printers[printers.length - 1] }), { status: 201 });
      }
      if (url === "/api/printers/1" && init?.method === "DELETE") {
        printers = printers.filter((p) => p.id !== 1);
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      if (url === "/api/label-templates") {
        return new Response(JSON.stringify({ templates: [] }), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { qc } = renderSettings(ADMIN_USER, { initialEntry: "/settings?tab=printing" });
    const invalidateSpy = vi.spyOn(qc, "invalidateQueries");

    expect(await screen.findByText("Kitchen Zebra")).toBeInTheDocument();

    // Add printer -> invalidates auth-status
    fireEvent.change(screen.getByPlaceholderText("Printer name"), { target: { value: "Garage Zebra" } });
    fireEvent.change(screen.getByPlaceholderText("http://192.168.1.50:631/ipp/print"), {
      target: { value: "http://192.168.1.51:631/ipp/print" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add Printer" }));

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["auth-status"] });
    });

    invalidateSpy.mockClear();

    // Delete printer -> invalidates auth-status
    const deleteBtn = await screen.findByRole("button", { name: "Delete Kitchen Zebra" });
    fireEvent.click(deleteBtn);

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["auth-status"] });
    });
  });
});

describe("SettingsPage Appearance, Quick Actions, and API Tokens", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
    document.documentElement.classList.remove("dark");
  });

  it("shows Appearance selector for member users and saves selection to profile via PATCH /api/auth/account", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api/auth/account" && init?.method === "PATCH") {
        const body = JSON.parse(String(init.body));
        return new Response(JSON.stringify({ user: { ...MEMBER_USER, theme: body.theme } }), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    renderSettings(MEMBER_USER, { withTheme: true });

    expect(screen.getByText("Appearance")).toBeInTheDocument();
    const darkRadio = screen.getByRole("radio", { name: "Dark" });
    fireEvent.click(darkRadio);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/auth/account",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ theme: "dark" }),
        })
      );
    });
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(await screen.findByText("Theme preference saved.")).toBeInTheDocument();
  });

  it("rolls back theme and shows an error when saving fails", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ error: "server error" }), { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);

    renderSettings(MEMBER_USER, { withTheme: true });

    fireEvent.click(screen.getByRole("radio", { name: "Dark" }));

    expect(await screen.findByText("server error")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "System" })).toHaveAttribute("aria-checked", "true");
  });

  it("applies theme locally in demo mode without calling PATCH /api/auth/account", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({}), { status: 403 }));
    vi.stubGlobal("fetch", fetchMock);

    renderSettings(MEMBER_USER, { demoMode: true, withTheme: true });

    fireEvent.click(screen.getByRole("radio", { name: "Dark" }));

    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(await screen.findByText("Theme updated locally for this browser.")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("toggles quick actions preference via PATCH /api/auth/account and supports demo mode locally", async () => {
    const patchPayloads: unknown[] = [];
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api/auth/account" && init?.method === "PATCH") {
        const body = JSON.parse(String(init.body));
        patchPayloads.push(body);
        return new Response(
          JSON.stringify({ user: { ...MEMBER_USER, quick_actions_enabled: body.quick_actions_enabled } }),
          { status: 200 }
        );
      }
      return new Response(JSON.stringify({}), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { unmount } = renderSettings(MEMBER_USER, { withTheme: true });

    const group = screen.getByRole("radiogroup", { name: "Quick actions" });
    const enabledBtn = group.querySelector('button[aria-checked="true"]') as HTMLButtonElement;
    expect(enabledBtn).toHaveTextContent("Enabled");

    fireEvent.click(screen.getByRole("radio", { name: "Disabled" }));
    expect(await screen.findByText("Quick actions preference saved.")).toBeInTheDocument();
    expect(patchPayloads).toEqual([{ quick_actions_enabled: false }]);
    expect(screen.getByRole("radio", { name: "Disabled" })).toHaveAttribute("aria-checked", "true");
    unmount();

    // Demo mode updates locally without calling PATCH /api/auth/account
    const demoFetch = vi.fn();
    vi.stubGlobal("fetch", demoFetch);
    renderSettings(MEMBER_USER, { demoMode: true, withTheme: true });

    fireEvent.click(screen.getByRole("radio", { name: "Disabled" }));
    expect(await screen.findByText("Quick actions preference updated locally for this session.")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Disabled" })).toHaveAttribute("aria-checked", "true");
    expect(demoFetch).not.toHaveBeenCalled();
  });

  it("creates, reveals once, lists, and revokes Personal API Tokens and disables controls in demo mode", async () => {
    let tokens: Array<{
      id: number;
      user_id: number;
      name: string;
      token_prefix: string;
      last_used_at: string | null;
      expires_at: string | null;
      created_at: string;
    }> = [];
    const createdPayloads: unknown[] = [];

    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url === "/api/auth/tokens" && (!init?.method || init.method === "GET")) {
          return new Response(JSON.stringify({ tokens }), { status: 200 });
        }
        if (url === "/api/auth/tokens" && init?.method === "POST") {
          const body = JSON.parse(String(init.body));
          createdPayloads.push(body);
          const meta = {
            id: 7,
            user_id: 2,
            name: body.name,
            token_prefix: "itm_abcd1234",
            last_used_at: null,
            expires_at: "2027-02-26T00:00:00Z",
            created_at: "2026-11-28T10:00:00Z",
          };
          tokens = [meta];
          return new Response(JSON.stringify({ token: "itm_abcd1234secretvalue", metadata: meta }), { status: 201 });
        }
        if (url === "/api/auth/tokens/7" && init?.method === "DELETE") {
          tokens = [];
          return new Response(JSON.stringify({ deleted: true }), { status: 200 });
        }
        return new Response(JSON.stringify({}), { status: 200 });
      })
    );

    const { unmount } = renderSettings(MEMBER_USER, { initialEntry: "/settings?tab=api-tokens", withTheme: true });

    expect(await screen.findByText("No personal API tokens yet.")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Token name"), { target: { value: "Home Assistant" } });
    fireEvent.change(screen.getByLabelText("Token expiration"), { target: { value: "90" } });
    fireEvent.click(screen.getByRole("button", { name: /Create Token/i }));

    const reveal = await screen.findByTestId("api-token-reveal");
    expect(reveal).toHaveTextContent("Home Assistant");
    expect(screen.getByLabelText("Created API token")).toHaveValue("itm_abcd1234secretvalue");
    expect(createdPayloads).toEqual([{ name: "Home Assistant", expires_in_days: 90 }]);
    expect(await screen.findByText("itm_abcd1234...")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Revoke Home Assistant" }));
    expect(await screen.findByText("No personal API tokens yet.")).toBeInTheDocument();
    unmount();

    // Demo mode disables API token creation
    renderSettings(MEMBER_USER, { initialEntry: "/settings?tab=api-tokens", demoMode: true, withTheme: true });
    expect(screen.getByLabelText("Token name")).toBeDisabled();
    expect(screen.getByRole("button", { name: /Create Token/i })).toBeDisabled();
  });
});

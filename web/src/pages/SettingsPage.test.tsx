import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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

function renderWithQuery(user: User) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <SettingsPage user={user} />
    </QueryClientProvider>
  );
}

describe("SettingsPage role-based visibility", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("shows only Account settings and skips admin API calls for member users", () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({}), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    renderWithQuery(MEMBER_USER);

    expect(screen.getByText("Account")).toBeInTheDocument();
    expect(screen.getByDisplayValue("member@home.local")).toBeInTheDocument();
    expect(screen.queryByText("Instance Configuration")).not.toBeInTheDocument();
    expect(screen.queryByText("Household Users (Admin)")).not.toBeInTheDocument();
    expect(screen.queryByText("Label Printers")).not.toBeInTheDocument();
    expect(screen.queryByText("ZPL Label Templates")).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows all admin settings sections and queries admin endpoints for admin users", async () => {
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
          JSON.stringify({ templates: [{ entity_type: "item", content: "^XA^XZ", is_custom: false, default_content: "^XA^XZ" }] }),
          { status: 200 }
        );
      }
      return new Response(JSON.stringify({}), { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    renderWithQuery(ADMIN_USER);

    expect(screen.getByText("Account")).toBeInTheDocument();
    expect(screen.getByText("Instance Configuration")).toBeInTheDocument();
    expect(screen.getByText("Household Users (Admin)")).toBeInTheDocument();
    expect(screen.getByText("Label Printers")).toBeInTheDocument();
    expect(screen.getByText("ZPL Label Templates")).toBeInTheDocument();

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/settings", expect.any(Object));
      expect(fetchMock).toHaveBeenCalledWith("/api/users", expect.any(Object));
      expect(fetchMock).toHaveBeenCalledWith("/api/printers", expect.any(Object));
      expect(fetchMock).toHaveBeenCalledWith("/api/label-templates", expect.any(Object));
    });
  });

  it("allows admins to promote/demote other users and configure Force OIDC", async () => {
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
        return new Response(
          JSON.stringify({
            base_url: "https://itemized.example.com",
            due_date_average_count: 3,
            oidc_issuer: "https://idp.example.com",
            oidc_client_id: "itemized",
            oidc_has_secret: false,
            oidc_auto_provision: false,
            oidc_force: true,
            llm_provider: "",
            llm_model: "",
            llm_base_url: "",
            llm_has_api_key: false,
          }),
          { status: 200 }
        );
      }
      if (url === "/api/users") {
        return new Response(JSON.stringify({ users: [ADMIN_USER, MEMBER_USER] }), { status: 200 });
      }
      if (url === "/api/users/2" && init?.method === "PATCH") {
        return new Response(JSON.stringify({ user: { ...MEMBER_USER, role: "admin" } }), { status: 200 });
      }
      if (url === "/api/printers") {
        return new Response(JSON.stringify({ printers: [] }), { status: 200 });
      }
      if (url === "/api/label-templates") {
        return new Response(JSON.stringify({ templates: [] }), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    renderWithQuery(ADMIN_USER);

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
    fireEvent.click(screen.getByRole("button", { name: "Save Settings" }));

    await waitFor(() => {
      const patchCall = fetchMock.mock.calls.find(
        ([url, init]) => url === "/api/settings" && (init as RequestInit | undefined)?.method === "PATCH"
      );
      expect(patchCall).toBeTruthy();
      const body = JSON.parse(String((patchCall![1] as RequestInit).body));
      expect(body.oidc_force).toBe("true");
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
      if (url === "/api/printers") {
        return new Response(JSON.stringify({ printers: [] }), { status: 200 });
      }
      if (url === "/api/label-templates") {
        return new Response(JSON.stringify({ templates: [] }), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <SettingsPage user={ADMIN_USER} demoMode={true} />
      </QueryClientProvider>
    );

    expect(screen.getByText(/Demo mode is active/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Update Account" })).toBeDisabled();
    expect(screen.getByPlaceholderText("Issuer URL")).toBeDisabled();
    expect(screen.getByPlaceholderText("Client ID")).toBeDisabled();
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
      if (url === "/api/users") {
        return new Response(JSON.stringify({ users: [ADMIN_USER] }), { status: 200 });
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

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = vi.spyOn(qc, "invalidateQueries");
    render(
      <QueryClientProvider client={qc}>
        <SettingsPage user={ADMIN_USER} />
      </QueryClientProvider>
    );

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
    const testPrintBtns = await screen.findAllByRole("button", { name: /Test Print/i });
    const deleteBtn = testPrintBtns[0].nextElementSibling as HTMLButtonElement | null;
    expect(deleteBtn).toBeTruthy();
    fireEvent.click(deleteBtn!);

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["auth-status"] });
    });
  });
});

describe("SettingsPage Appearance theme selector", () => {
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

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <ThemeProvider>
          <SettingsPage user={MEMBER_USER} />
        </ThemeProvider>
      </QueryClientProvider>
    );

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

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <ThemeProvider>
          <SettingsPage user={MEMBER_USER} />
        </ThemeProvider>
      </QueryClientProvider>
    );

    fireEvent.click(screen.getByRole("radio", { name: "Dark" }));

    expect(await screen.findByText("server error")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "System" })).toHaveAttribute("aria-checked", "true");
  });

  it("applies theme locally in demo mode without calling PATCH /api/auth/account", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({}), { status: 403 }));
    vi.stubGlobal("fetch", fetchMock);

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <ThemeProvider>
          <SettingsPage user={MEMBER_USER} demoMode />
        </ThemeProvider>
      </QueryClientProvider>
    );

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

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { unmount } = render(
      <QueryClientProvider client={qc}>
        <ThemeProvider>
          <SettingsPage user={MEMBER_USER} />
        </ThemeProvider>
      </QueryClientProvider>
    );

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
    const qc2 = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc2}>
        <ThemeProvider>
          <SettingsPage user={MEMBER_USER} demoMode />
        </ThemeProvider>
      </QueryClientProvider>
    );

    fireEvent.click(screen.getByRole("radio", { name: "Disabled" }));
    expect(await screen.findByText("Quick actions preference updated locally for this session.")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Disabled" })).toHaveAttribute("aria-checked", "true");
    expect(demoFetch).not.toHaveBeenCalled();
  });
});

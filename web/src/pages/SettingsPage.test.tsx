import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SettingsPage } from "./SettingsPage";
import { User } from "../api";

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
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppRoutes } from "./App";
import { HelpProvider } from "./components/HelpContext";
import { AuthStatus } from "./api";

const LocationEcho = () => {
  const loc = useLocation();
  return <div data-testid="current-path">{loc.pathname}</div>;
};

const testUser = {
  id: 1,
  email: "alice@example.com",
  role: "member" as const,
  oidc_issuer: "https://idp.example.com",
  oidc_subject: "sub-123",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

describe("AppRoutes logout behavior", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  it("clears non-auth queries, resets route to /, and immediately shows the login screen on logout", async () => {
    let loggedIn = true;
    const logoutCalls: string[] = [];

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url === "/api/auth/status") {
          const body: AuthStatus = {
            initialized: true,
            oidc_enabled: true,
            oidc_force: false,
            user: loggedIn ? testUser : null,
          };
          return new Response(JSON.stringify(body), { status: 200 });
        }
        if (url === "/api/auth/logout" && init?.method === "POST") {
          logoutCalls.push(url);
          loggedIn = false;
          return new Response(JSON.stringify({ ok: true }), { status: 200 });
        }
        if (url === "/api/locations") {
          return new Response(JSON.stringify({ locations: [] }), { status: 200 });
        }
        if (url === "/api/categories") {
          return new Response(JSON.stringify({ categories: [] }), { status: 200 });
        }
        return new Response(JSON.stringify({ status_counts: {}, products: [] }), { status: 200 });
      })
    );

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={["/settings"]}>
          <HelpProvider>
            <LocationEcho />
            <AppRoutes />
          </HelpProvider>
        </MemoryRouter>
      </QueryClientProvider>
    );

    const logoutBtn = await waitFor(() => screen.getByRole("button", { name: "Logout" }));
    expect(screen.getByTestId("current-path").textContent).toBe("/settings");

    // Ensure non-auth queries have been populated in the cache before logout.
    await waitFor(() => {
      expect(qc.getQueryData(["locations"])).toBeDefined();
    });

    fireEvent.click(logoutBtn);

    await waitFor(() => {
      expect(screen.getByRole("link", { name: /Sign in with OIDC/i })).toBeInTheDocument();
    });

    expect(logoutCalls).toEqual(["/api/auth/logout"]);
    expect(screen.getByLabelText(/Email address/i)).toBeInTheDocument();
    expect(screen.getByTestId("current-path").textContent).toBe("/");
    expect(qc.getQueryData(["locations"])).toBeUndefined();
    expect(qc.getQueryData(["categories"])).toBeUndefined();
  });

  it("immediately transitions to Force OIDC redirect on logout when oidc_force is active", async () => {
    let loggedIn = true;
    const redirect = vi.fn();

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url === "/api/auth/status") {
          const body: AuthStatus = {
            initialized: true,
            oidc_enabled: true,
            oidc_force: true,
            user: loggedIn ? testUser : null,
          };
          return new Response(JSON.stringify(body), { status: 200 });
        }
        if (url === "/api/auth/logout" && init?.method === "POST") {
          loggedIn = false;
          return new Response(JSON.stringify({ ok: true }), { status: 200 });
        }
        if (url === "/api/locations") {
          return new Response(JSON.stringify({ locations: [] }), { status: 200 });
        }
        if (url === "/api/categories") {
          return new Response(JSON.stringify({ categories: [] }), { status: 200 });
        }
        return new Response(JSON.stringify({ status_counts: {}, products: [] }), { status: 200 });
      })
    );

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={["/settings"]}>
          <HelpProvider>
            <LocationEcho />
            <AppRoutes onOidcRedirect={redirect} />
          </HelpProvider>
        </MemoryRouter>
      </QueryClientProvider>
    );

    const logoutBtn = await waitFor(() => screen.getByRole("button", { name: "Logout" }));
    fireEvent.click(logoutBtn);

    await waitFor(() => {
      expect(redirect).toHaveBeenCalledWith("/api/auth/oidc/login");
    });

    expect(screen.getByText(/Redirecting to your identity provider/i)).toBeInTheDocument();
    expect(screen.getByTestId("current-path").textContent).toBe("/");
  });
});

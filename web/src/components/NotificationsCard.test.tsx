import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NotificationsCard } from "./NotificationsCard";

function renderCard(props: { demoMode?: boolean; onFlash?: (m: string) => void; onError?: (m: string) => void } = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <NotificationsCard
        demoMode={props.demoMode}
        onFlash={props.onFlash || vi.fn()}
        onError={props.onError || vi.fn()}
      />
    </QueryClientProvider>
  );
}

describe("NotificationsCard", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(window, "isSecureContext", { value: true, configurable: true });
    Object.defineProperty(navigator, "userAgent", {
      value: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
      configurable: true,
    });
  });

  it("shows demo mode notice and disables controls when demoMode is true", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    renderCard({ demoMode: true });

    expect(screen.getByText("Disabled in demo mode")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Enable on This Device/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Send Test Notification/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Save Digest Preferences/i })).toBeDisabled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows HTTPS guidance on insecure origins", () => {
    Object.defineProperty(window, "isSecureContext", { value: false, configurable: true });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url === "/api/notifications/config") {
          return new Response(JSON.stringify({ enabled: true, vapid_public_key: "pub", timezone: "UTC" }), { status: 200 });
        }
        if (url === "/api/notifications/preferences") {
          return new Response(
            JSON.stringify({ digest_time: "08:30", expiration_enabled: false, shopping_list_enabled: false, timezone: "UTC" }),
            { status: 200 }
          );
        }
        return new Response(JSON.stringify({ targets: [] }), { status: 200 });
      })
    );

    renderCard();

    expect(screen.getByText(/HTTPS is required by browsers/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Enable on This Device/i })).toBeDisabled();
  });

  it("shows iOS Add to Home Screen guidance when in iOS Safari outside standalone mode", () => {
    Object.defineProperty(navigator, "userAgent", {
      value: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1",
      configurable: true,
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ targets: [], digest_time: "08:30", timezone: "UTC" }), { status: 200 }))
    );

    renderCard();

    expect(screen.getByText(/Add to Home Screen/i)).toBeInTheDocument();
  });

  it("loads targets and saves updated digest preferences", async () => {
    const onFlash = vi.fn();
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api/notifications/config") {
        return new Response(JSON.stringify({ enabled: true, vapid_public_key: "pub", timezone: "America/New_York" }), {
          status: 200,
        });
      }
      if (url === "/api/notifications/preferences" && (!init?.method || init.method === "GET")) {
        return new Response(
          JSON.stringify({
            digest_time: "08:30",
            expiration_enabled: false,
            shopping_list_enabled: false,
            timezone: "America/New_York",
          }),
          { status: 200 }
        );
      }
      if (url === "/api/notifications/preferences" && init?.method === "PATCH") {
        return new Response(
          JSON.stringify({
            digest_time: "09:15",
            expiration_enabled: true,
            shopping_list_enabled: true,
            timezone: "America/New_York",
          }),
          { status: 200 }
        );
      }
      if (url === "/api/notifications/targets") {
        return new Response(
          JSON.stringify({
            targets: [{ id: 1, channel: "web_push", label: "iPhone", created_at: "2026-11-28T00:00:00Z", last_used_at: null, last_error: null }],
          }),
          { status: 200 }
        );
      }
      if (url === "/api/notifications/test" && init?.method === "POST") {
        return new Response(JSON.stringify({ sent: 1, failed: 0, pruned: 0 }), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    renderCard({ onFlash });

    await waitFor(() => {
      expect(screen.getByText("iPhone")).toBeInTheDocument();
      expect(screen.getByText(/Server timezone: America\/New_York/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByLabelText(/Expiring & Overdue Items/i));
    fireEvent.click(screen.getByLabelText(/Shopping List \/ Low Stock/i));
    fireEvent.change(screen.getByLabelText(/Daily send time/i), { target: { value: "09:15" } });
    fireEvent.click(screen.getByRole("button", { name: /Save Digest Preferences/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/notifications/preferences",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({
            digest_time: "09:15",
            expiration_enabled: true,
            shopping_list_enabled: true,
          }),
        })
      );
      expect(onFlash).toHaveBeenCalledWith("Notification preferences saved.");
    });

    fireEvent.click(screen.getByRole("button", { name: /Send Test Notification/i }));
    await waitFor(() => {
      expect(onFlash).toHaveBeenCalledWith("Test notification sent to 1 device.");
    });
  });
});

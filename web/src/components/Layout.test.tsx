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
  });
});

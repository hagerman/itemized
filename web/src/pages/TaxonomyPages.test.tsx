import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CategoriesPage, LocationsPage, LocationDetailPage } from "./TaxonomyPages";
import type { Category, Location } from "../api";

function renderWithProviders(ui: React.ReactElement, initialEntries: string[] = ["/"]) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={initialEntries}>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe("CategoriesPage inline editing", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("edits a category name and parent, excludes self/descendants from parent picker, and cancels cleanly", async () => {
    let categories: Category[] = [
      { id: 1, name: "Food", parent_id: null, hierarchy_name: "Food" },
      { id: 2, name: "Dairy", parent_id: 1, hierarchy_name: "Food > Dairy" },
      { id: 3, name: "Cheese", parent_id: 2, hierarchy_name: "Food > Dairy > Cheese" },
      { id: 4, name: "Beverages", parent_id: null, hierarchy_name: "Beverages" },
    ];
    const patchPayloads: Array<{ url: string; body: unknown }> = [];

    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url === "/api/categories" && (!init?.method || init.method === "GET")) {
          return new Response(JSON.stringify({ categories }), { status: 200 });
        }
        if (url.startsWith("/api/categories/") && init?.method === "PATCH") {
          const id = Number(url.split("/").pop());
          const body = JSON.parse(String(init.body)) as { name: string; parent_id: number | null };
          patchPayloads.push({ url, body });
          categories = categories.map((c) =>
            c.id === id ? { ...c, name: body.name, parent_id: body.parent_id } : c
          );
          return new Response(JSON.stringify({ category: categories.find((c) => c.id === id) }), { status: 200 });
        }
        return new Response(JSON.stringify({}), { status: 200 });
      })
    );

    renderWithProviders(<CategoriesPage />);
    expect(await screen.findByText("Food")).toBeInTheDocument();

    // Open edit on Food -> parent picker must exclude Food, Dairy, and Cheese (only Top-level & Beverages available)
    fireEvent.click(screen.getByRole("button", { name: "Edit Food" }));
    fireEvent.click(screen.getByRole("button", { name: "Edit parent category" }));
    const menu = screen.getByTestId("hierarchy-portal-menu");
    expect(menu).toHaveTextContent("Top-level");
    expect(menu).toHaveTextContent("Beverages");
    expect(menu).not.toHaveTextContent("Food");
    expect(menu).not.toHaveTextContent("Dairy");
    expect(menu).not.toHaveTextContent("Cheese");

    // Cancel closes edit mode without sending PATCH
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(patchPayloads).toHaveLength(0);
    expect(screen.queryByLabelText("Edit category name")).not.toBeInTheDocument();

    // Edit Cheese: rename to "Soda" and move under Beverages
    fireEvent.click(screen.getByRole("button", { name: "Edit Cheese" }));
    fireEvent.change(screen.getByLabelText("Edit category name"), { target: { value: "Soda" } });
    fireEvent.click(screen.getByRole("button", { name: "Edit parent category" }));
    fireEvent.click(screen.getByTestId("hierarchy-portal-menu").querySelectorAll("button")[1]); // Beverages
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(patchPayloads).toEqual([{ url: "/api/categories/3", body: { name: "Soda", parent_id: 4 } }]);
    });
    expect(await screen.findByText("Soda")).toBeInTheDocument();
  });

  it("displays API validation error inline when saving a category fails", async () => {
    const categories: Category[] = [{ id: 1, name: "Food", parent_id: null, hierarchy_name: "Food" }];

    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url === "/api/categories" && (!init?.method || init.method === "GET")) {
          return new Response(JSON.stringify({ categories }), { status: 200 });
        }
        if (url === "/api/categories/1" && init?.method === "PATCH") {
          return new Response(JSON.stringify({ error: "name is required" }), { status: 422 });
        }
        return new Response(JSON.stringify({}), { status: 200 });
      })
    );

    renderWithProviders(<CategoriesPage />);
    expect(await screen.findByText("Food")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Edit Food" }));
    fireEvent.change(screen.getByLabelText("Edit category name"), { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("name is required");
    expect(screen.getByLabelText("Edit category name")).toBeInTheDocument();
  });
});

describe("LocationsPage and LocationDetailPage inline editing", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("edits a location name, parent (including clearing to Top-level), and freezer flag on LocationsPage", async () => {
    let locations: Location[] = [
      { id: 1, name: "Kitchen", parent_id: null, is_freezer: false, hierarchy_name: "Kitchen" },
      { id: 2, name: "Fridge", parent_id: 1, is_freezer: false, hierarchy_name: "Kitchen > Fridge" },
      { id: 3, name: "Top Shelf", parent_id: 2, is_freezer: false, hierarchy_name: "Kitchen > Fridge > Top Shelf" },
      { id: 4, name: "Garage", parent_id: null, is_freezer: false, hierarchy_name: "Garage" },
    ];
    const patchPayloads: Array<{ url: string; body: unknown }> = [];

    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url === "/api/locations" && (!init?.method || init.method === "GET")) {
          return new Response(JSON.stringify({ locations }), { status: 200 });
        }
        if (url.startsWith("/api/locations/") && init?.method === "PATCH") {
          const id = Number(url.split("/").pop());
          const body = JSON.parse(String(init.body)) as {
            name: string;
            parent_id: number | null;
            is_freezer: boolean;
          };
          patchPayloads.push({ url, body });
          locations = locations.map((l) =>
            l.id === id
              ? { ...l, name: body.name, parent_id: body.parent_id, is_freezer: body.is_freezer }
              : l
          );
          return new Response(JSON.stringify({ location: locations.find((l) => l.id === id) }), { status: 200 });
        }
        return new Response(JSON.stringify({}), { status: 200 });
      })
    );

    renderWithProviders(<LocationsPage />);
    expect(await screen.findByText("Kitchen")).toBeInTheDocument();

    // Edit Kitchen -> verify self and descendants (Fridge, Top Shelf) are excluded from parent picker
    fireEvent.click(screen.getByRole("button", { name: "Edit Kitchen" }));
    fireEvent.click(screen.getByRole("button", { name: "Edit parent location" }));
    const menu = screen.getByTestId("hierarchy-portal-menu");
    expect(menu).toHaveTextContent("Top-level");
    expect(menu).toHaveTextContent("Garage");
    expect(menu).not.toHaveTextContent("Kitchen");
    expect(menu).not.toHaveTextContent("Fridge");
    expect(menu).not.toHaveTextContent("Top Shelf");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    // Edit Fridge -> rename to "Chest Freezer", promote to Top-level, and toggle Freezer on
    fireEvent.click(screen.getByRole("button", { name: "Edit Fridge" }));
    fireEvent.change(screen.getByLabelText("Edit location name"), { target: { value: "Chest Freezer" } });
    fireEvent.click(screen.getByRole("button", { name: "Edit parent location" }));
    fireEvent.click(screen.getByTestId("hierarchy-portal-menu").querySelectorAll("button")[0]); // Top-level
    fireEvent.click(screen.getByLabelText("Edit freezer flag"));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(patchPayloads).toEqual([
        {
          url: "/api/locations/2",
          body: { name: "Chest Freezer", parent_id: null, is_freezer: true },
        },
      ]);
    });
    expect(await screen.findByText("Chest Freezer")).toBeInTheDocument();
  });

  it("edits a location from LocationDetailPage and refreshes header metadata", async () => {
    let location: Location = {
      id: 2,
      name: "Fridge",
      parent_id: 1,
      is_freezer: false,
      hierarchy_name: "Kitchen > Fridge",
    };
    const locations: Location[] = [
      { id: 1, name: "Kitchen", parent_id: null, is_freezer: false, hierarchy_name: "Kitchen" },
      location,
      { id: 3, name: "Garage", parent_id: null, is_freezer: false, hierarchy_name: "Garage" },
    ];
    const patchPayloads: Array<{ url: string; body: unknown }> = [];

    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url === "/api/locations/2" && (!init?.method || init.method === "GET")) {
          return new Response(JSON.stringify({ location, items: [] }), { status: 200 });
        }
        if (url === "/api/locations" && (!init?.method || init.method === "GET")) {
          return new Response(JSON.stringify({ locations }), { status: 200 });
        }
        if (url === "/api/locations/2" && init?.method === "PATCH") {
          const body = JSON.parse(String(init.body)) as {
            name: string;
            parent_id: number | null;
            is_freezer: boolean;
          };
          patchPayloads.push({ url, body });
          location = {
            ...location,
            name: body.name,
            parent_id: body.parent_id,
            is_freezer: body.is_freezer,
            hierarchy_name: body.parent_id === 3 ? `Garage > ${body.name}` : body.name,
          };
          return new Response(JSON.stringify({ location }), { status: 200 });
        }
        return new Response(JSON.stringify({}), { status: 200 });
      })
    );

    renderWithProviders(
      <Routes>
        <Route path="/locations/:id" element={<LocationDetailPage />} />
      </Routes>,
      ["/locations/2"]
    );

    expect(await screen.findByText("Kitchen > Fridge")).toBeInTheDocument();
    expect(screen.queryByText("Freezer location")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByLabelText("Edit location name"), { target: { value: "Deep Freeze" } });
    fireEvent.click(screen.getByRole("button", { name: "Edit parent location" }));
    fireEvent.click(screen.getByTestId("hierarchy-portal-menu").querySelectorAll("button")[1]); // Garage (sorted: Garage, Kitchen)
    fireEvent.click(screen.getByLabelText("Edit freezer flag"));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(patchPayloads).toEqual([
        {
          url: "/api/locations/2",
          body: { name: "Deep Freeze", parent_id: 3, is_freezer: true },
        },
      ]);
    });
    expect(await screen.findByText("Garage > Deep Freeze")).toBeInTheDocument();
    expect(screen.getByText("Freezer location")).toBeInTheDocument();
  });

  it("shows location print buttons only when printers are enabled", async () => {
    const locations: Location[] = [
      { id: 1, name: "Kitchen", parent_id: null, is_freezer: false, hierarchy_name: "Kitchen" },
    ];
    let printersEnabled = false;

    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url === "/api/auth/status") {
          return new Response(
            JSON.stringify({ initialized: true, oidc_enabled: false, oidc_force: false, printers_enabled: printersEnabled, user: { id: 1, email: "a@b.c", role: "member" } }),
            { status: 200 }
          );
        }
        if (url === "/api/locations") {
          return new Response(JSON.stringify({ locations }), { status: 200 });
        }
        if (url === "/api/locations/1") {
          return new Response(JSON.stringify({ location: locations[0], items: [] }), { status: 200 });
        }
        return new Response(JSON.stringify({}), { status: 200 });
      })
    );

    // 1. Printers disabled -> omit print buttons on LocationsPage and LocationDetailPage
    const { unmount: unmountList1 } = renderWithProviders(<LocationsPage />);
    expect(await screen.findByText("Kitchen")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Print location label" })).not.toBeInTheDocument();
    unmountList1();

    const { unmount: unmountDetail1 } = renderWithProviders(
      <Routes>
        <Route path="/locations/:id" element={<LocationDetailPage />} />
      </Routes>,
      ["/locations/1"]
    );
    expect(await screen.findByRole("heading", { name: "Kitchen" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Print Location Label/i })).not.toBeInTheDocument();
    unmountDetail1();

    // 2. Printers enabled -> show print buttons on both views
    printersEnabled = true;
    const { unmount: unmountList2 } = renderWithProviders(<LocationsPage />);
    expect(await screen.findByRole("button", { name: "Print location label" })).toBeInTheDocument();
    unmountList2();

    renderWithProviders(
      <Routes>
        <Route path="/locations/:id" element={<LocationDetailPage />} />
      </Routes>,
      ["/locations/1"]
    );
    expect(await screen.findByRole("button", { name: /Print Location Label/i })).toBeInTheDocument();
  });

  it("offers 1-click starter load buttons on empty Categories and Locations pages", async () => {
    let categories: Category[] = [];
    let locations: Location[] = [];
    const payloads: unknown[] = [];

    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url === "/api/categories") {
          return new Response(JSON.stringify({ categories }), { status: 200 });
        }
        if (url === "/api/locations") {
          return new Response(JSON.stringify({ locations }), { status: 200 });
        }
        if (url === "/api/onboarding/starter-taxonomy" && init?.method === "POST") {
          const body = JSON.parse(String(init.body)) as { categories?: boolean; locations?: boolean };
          payloads.push(body);
          if (body.categories) {
            categories = [{ id: 1, name: "Groceries", parent_id: null, hierarchy_name: "Groceries" }];
          }
          if (body.locations) {
            locations = [{ id: 1, name: "Kitchen", parent_id: null, is_freezer: false, hierarchy_name: "Kitchen" }];
          }
          return new Response(JSON.stringify({ categories_created: 1, locations_created: 1, categories, locations }), { status: 200 });
        }
        return new Response(JSON.stringify({}), { status: 200 });
      })
    );

    const { unmount } = renderWithProviders(<CategoriesPage />);
    fireEvent.click(await screen.findByRole("button", { name: /Load Starter Categories/i }));
    expect(await screen.findByText("Groceries")).toBeInTheDocument();
    unmount();

    renderWithProviders(<LocationsPage />);
    fireEvent.click(await screen.findByRole("button", { name: /Load Starter Locations/i }));
    expect(await screen.findByText("Kitchen")).toBeInTheDocument();

    expect(payloads).toEqual([
      { categories: true, locations: false },
      { categories: false, locations: true },
    ]);
  });
});

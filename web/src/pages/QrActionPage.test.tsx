import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QrActionPage } from "./QrActionPage";
import type { Item, Location, Product } from "../api";

const sampleLocations: Location[] = [
  { id: 1, name: "Pantry", parent_id: null, is_freezer: false, hierarchy_name: "Pantry" },
  { id: 2, name: "Fridge", parent_id: null, is_freezer: false, hierarchy_name: "Fridge" },
  { id: 3, name: "Freezer", parent_id: null, is_freezer: true, hierarchy_name: "Freezer" },
  { id: 4, name: "Top Drawer", parent_id: 3, is_freezer: true, hierarchy_name: "Freezer > Top Drawer" },
  { id: 5, name: "Bottom Drawer", parent_id: 3, is_freezer: true, hierarchy_name: "Freezer > Bottom Drawer" },
];

const sampleProduct: Product = {
  id: 10,
  name: "Milk, Whole",
  category_id: 1,
  category_name: "Dairy",
  default_location_id: 2,
  default_location_name: "Fridge",
  default_due_days: 7,
  calculated_due_days: 10,
  default_due_days_on_open: 5,
  default_due_days_on_freeze: 90,
  default_due_days_on_thaw: 3,
  use_average_for_due_date: true,
  label_print_mode: "per_item",
  minimum_value: 1,
  manually_added_to_shopping_list: false,
  volume_value: null,
  volume_unit: null,
  weight_value: null,
  weight_unit: null,
  length_value: null,
  length_unit: null,
  in_stock_count: 2,
  next_due_on_date: "2026-12-01",
  on_shopping_list: false,
  low_stock: false,
  low_stock_amount: null,
  due_soon: false,
  overdue: false,
};

function makeItem(overrides: Partial<Item> = {}): Item {
  return {
    id: 42,
    product_id: 10,
    product_name: "Milk, Whole",
    variant_id: 1,
    variant_name: "1 Gallon",
    location_id: 2,
    location_name: "Fridge",
    purchased_on_date: "2026-11-20",
    opened_on_date: null,
    due_on_date: "2026-12-01",
    consumed_on_date: null,
    notes: "Organic",
    ...overrides,
  };
}

function renderQrRoute(initialEntry: string) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/go/:kind/:id" element={<QrActionPage />} />
          <Route path="/" element={<div>Inventory Home</div>} />
          <Route path="/products/:id" element={<div>Product Detail</div>} />
          <Route path="/locations/:id" element={<div>Location Detail</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

function jsonResp(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("QrActionPage", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows invalid QR link error state for unrecognized kind without calling API", async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url === "/api/locations") return Promise.resolve(jsonResp({ locations: sampleLocations }));
      return Promise.reject(new Error(`unexpected fetch ${url}`));
    });

    renderQrRoute("/go/x/123");
    expect(await screen.findByText("Invalid QR link")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Back to Inventory/i })).toHaveAttribute("href", "/");
  });

  it("shows not-found state when /api/scan/resolve returns unknown", async () => {
    fetchMock.mockImplementation((url: string) => {
      if (url === "/api/locations") return Promise.resolve(jsonResp({ locations: sampleLocations }));
      if (url === "/api/scan/resolve") return Promise.resolve(jsonResp({ kind: "unknown", input: "/go/i/999" }));
      return Promise.reject(new Error(`unexpected fetch ${url}`));
    });

    renderQrRoute("/go/i/999");
    expect(await screen.findByText("Item not found")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Back to Inventory/i })).toHaveAttribute("href", "/");
  });

  it("supports Item QR consume with undo, open with undo, transfer, and shopping list toggle", async () => {
    let currentItem = makeItem();
    let currentProduct = { ...sampleProduct };

    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url === "/api/locations") return Promise.resolve(jsonResp({ locations: sampleLocations }));
      if (url === "/api/scan/resolve") {
        return Promise.resolve(jsonResp({ kind: "item", item: currentItem, product: currentProduct }));
      }
      if (url === "/api/items/42/consume" && init?.method === "POST") {
        currentItem = { ...currentItem, consumed_on_date: "2026-11-27" };
        return Promise.resolve(jsonResp({ item: currentItem, previous: makeItem(), already_consumed: false }));
      }
      if (url === "/api/items/42" && init?.method === "PATCH") {
        const patch = JSON.parse(String(init.body));
        currentItem = { ...currentItem, ...patch };
        return Promise.resolve(jsonResp({ item: currentItem }));
      }
      if (url === "/api/items/42/open" && init?.method === "POST") {
        const prev = { ...currentItem };
        currentItem = { ...currentItem, opened_on_date: "2026-11-27", due_on_date: "2026-12-02" };
        return Promise.resolve(jsonResp({ item: currentItem, previous: prev }));
      }
      if (url === "/api/items/42/transfer" && init?.method === "POST") {
        currentItem = { ...currentItem, location_id: 3, location_name: "Freezer", due_on_date: "2027-02-25" };
        return Promise.resolve(jsonResp({ item: currentItem }));
      }
      if (url === "/api/products/10/toggle-shopping-list" && init?.method === "POST") {
        currentProduct = { ...currentProduct, on_shopping_list: !currentProduct.on_shopping_list };
        return Promise.resolve(jsonResp({ product: currentProduct }));
      }
      return Promise.reject(new Error(`unexpected fetch ${url}`));
    });

    renderQrRoute("/go/i/42");
    expect(await screen.findByText("Milk, Whole")).toBeInTheDocument();
    expect(screen.getByText("1 Gallon")).toBeInTheDocument();
    expect(screen.getByText("Organic")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /View Full Product/i })).toHaveAttribute("href", "/products/10");

    // Consume + Undo
    fireEvent.click(screen.getByRole("button", { name: /^Consume$/i }));
    expect(await screen.findByText(/Consumed Milk, Whole/i)).toBeInTheDocument();
    expect(await screen.findByText(/Already consumed on/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Undo/i }));
    expect(await screen.findByRole("button", { name: /^Consume$/i })).toBeInTheDocument();

    // Open + Undo
    fireEvent.click(screen.getByRole("button", { name: /^Open$/i }));
    expect(await screen.findByText(/Opened Milk, Whole/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Undo/i }));
    expect(await screen.findByRole("button", { name: /^Open$/i })).toBeInTheDocument();

    // Transfer to Freezer (Freezer has children, so drill in and click "Select “Freezer”")
    fireEvent.click(screen.getByRole("button", { name: /Transfer/i }));
    fireEvent.click(screen.getByRole("button", { name: /Destination location for Milk, Whole/i }));
    fireEvent.click(screen.getByRole("button", { name: /^Freezer$/i }));
    fireEvent.click(screen.getByText(/Select “Freezer”/));
    fireEvent.click(screen.getByRole("button", { name: /Confirm Transfer/i }));
    expect(await screen.findByText(/Moved Milk, Whole to Freezer/i)).toBeInTheDocument();

    // Toggle Shopping List
    fireEvent.click(screen.getByRole("button", { name: /Add to Shopping List/i }));
    expect(await screen.findByRole("button", { name: /On Shopping List/i })).toBeInTheDocument();
  });

  it("shows already-consumed state with Restore / Unconsume button for consumed item QR", async () => {
    let currentItem = makeItem({ consumed_on_date: "2026-11-20" });

    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url === "/api/locations") return Promise.resolve(jsonResp({ locations: sampleLocations }));
      if (url === "/api/scan/resolve") {
        return Promise.resolve(jsonResp({ kind: "item", item: currentItem, product: sampleProduct }));
      }
      if (url === "/api/items/42" && init?.method === "PATCH") {
        currentItem = { ...currentItem, consumed_on_date: null };
        return Promise.resolve(jsonResp({ item: currentItem }));
      }
      return Promise.reject(new Error(`unexpected fetch ${url}`));
    });

    renderQrRoute("/go/i/42");
    expect(await screen.findByText(/2026-11-20/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Consume$/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Restore \/ Unconsume/i }));
    expect(await screen.findByRole("button", { name: /^Consume$/i })).toBeInTheDocument();
  });

  it("supports Product QR FIFO Consume Next with undo, per-item transfer, and Quick Add (+1) restock", async () => {
    let items: Item[] = [
      makeItem({ id: 51, due_on_date: "2026-12-01", location_id: 2, location_name: "Fridge" }),
      makeItem({ id: 52, due_on_date: "2026-12-15", location_id: 1, location_name: "Pantry" }),
    ];

    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url === "/api/locations") return Promise.resolve(jsonResp({ locations: sampleLocations }));
      if (url === "/api/scan/resolve") {
        return Promise.resolve(jsonResp({ kind: "product", product: { ...sampleProduct, in_stock_count: items.length }, items }));
      }
      if (url === "/api/items/51/consume" && init?.method === "POST") {
        const consumed = items.find((i) => i.id === 51)!;
        items = items.filter((i) => i.id !== 51);
        return Promise.resolve(jsonResp({ item: { ...consumed, consumed_on_date: "2026-11-27" }, already_consumed: false }));
      }
      if (url === "/api/items/51" && init?.method === "PATCH") {
        items = [makeItem({ id: 51, due_on_date: "2026-12-01", location_id: 2, location_name: "Fridge" }), ...items];
        return Promise.resolve(jsonResp({ item: items[0] }));
      }
      if (url === "/api/items" && init?.method === "POST") {
        const body = JSON.parse(String(init.body));
        expect(body.product_id).toBe(10);
        expect(body.location_id).toBe(2);
        expect(body.quantity).toBe(1);
        const added = makeItem({ id: 53, due_on_date: body.due_on_date });
        items = [...items, added];
        return Promise.resolve(jsonResp({ items: [added] }, 201));
      }
      return Promise.reject(new Error(`unexpected fetch ${url}`));
    });

    renderQrRoute("/go/p/10");
    expect(await screen.findByText("Milk, Whole")).toBeInTheDocument();
    expect(screen.getByText("2 in stock")).toBeInTheDocument();

    // Consume Next (soonest due item 51)
    fireEvent.click(screen.getByRole("button", { name: /Consume Next/i }));
    await waitFor(() => expect(screen.getByText("1 in stock")).toBeInTheDocument());

    // Undo restores item 51
    fireEvent.click(screen.getByRole("button", { name: /Undo/i }));
    await waitFor(() => expect(screen.getByText("2 in stock")).toBeInTheDocument());

    // Quick Add (+1)
    fireEvent.click(screen.getByRole("button", { name: /Quick Add \(\+1\)/i }));
    await waitFor(() => expect(screen.getByText("3 in stock")).toBeInTheDocument());
  });

  it("supports Location QR item consume/undo, transfer, filter when >5 items, and sub-location chips", async () => {
    let items: Item[] = [
      makeItem({ id: 101, product_name: "Chicken Breasts", location_id: 3, location_name: "Freezer" }),
      makeItem({ id: 102, product_name: "Peas, Frozen", location_id: 3, location_name: "Freezer" }),
      makeItem({ id: 103, product_name: "Ice Cream, Vanilla", location_id: 3, location_name: "Freezer" }),
      makeItem({ id: 104, product_name: "Bread, Sourdough", location_id: 3, location_name: "Freezer" }),
      makeItem({ id: 105, product_name: "Broth, Chicken", location_id: 3, location_name: "Freezer" }),
      makeItem({ id: 106, product_name: "Berries, Mixed", location_id: 3, location_name: "Freezer" }),
    ];

    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url === "/api/locations") return Promise.resolve(jsonResp({ locations: sampleLocations }));
      if (url === "/api/scan/resolve") {
        return Promise.resolve(jsonResp({ kind: "location", location: sampleLocations[2], items }));
      }
      if (url === "/api/items/101/consume" && init?.method === "POST") {
        const consumed = items.find((i) => i.id === 101)!;
        items = items.filter((i) => i.id !== 101);
        return Promise.resolve(jsonResp({ item: { ...consumed, consumed_on_date: "2026-11-27" }, already_consumed: false }));
      }
      if (url === "/api/items/101" && init?.method === "PATCH") {
        items = [makeItem({ id: 101, product_name: "Chicken Breasts", location_id: 3, location_name: "Freezer" }), ...items];
        return Promise.resolve(jsonResp({ item: items[0] }));
      }
      if (url === "/api/items/102/transfer" && init?.method === "POST") {
        items = items.filter((i) => i.id !== 102);
        return Promise.resolve(jsonResp({ item: makeItem({ id: 102, product_name: "Peas, Frozen", location_id: 2, location_name: "Fridge" }) }));
      }
      return Promise.reject(new Error(`unexpected fetch ${url}`));
    });

    renderQrRoute("/go/l/3");
    expect(await screen.findByRole("heading", { name: "Freezer" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Top Drawer/i })).toHaveAttribute("href", "/go/l/4");
    expect(screen.getByRole("link", { name: /Bottom Drawer/i })).toHaveAttribute("href", "/go/l/5");
    expect(screen.getByRole("link", { name: /View Full Location/i })).toHaveAttribute("href", "/locations/3");

    // Filter (> 5 items)
    const filterInput = screen.getByRole("searchbox", { name: /Filter items in location/i });
    fireEvent.change(filterInput, { target: { value: "chicken" } });
    expect(screen.getByText("Chicken Breasts")).toBeInTheDocument();
    expect(screen.getByText("Broth, Chicken")).toBeInTheDocument();
    expect(screen.queryByText("Ice Cream, Vanilla")).not.toBeInTheDocument();
    fireEvent.change(filterInput, { target: { value: "" } });

    // Consume first item + Undo
    const chickenLink = screen.getByRole("link", { name: "Chicken Breasts" });
    const chickenRow = chickenLink.closest("div.p-3") as HTMLElement;
    fireEvent.click(within(chickenRow).getByRole("button", { name: /^Consume$/i }));
    await waitFor(() => expect(screen.queryByRole("link", { name: "Chicken Breasts" })).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /Undo/i }));
    expect(await screen.findByRole("link", { name: "Chicken Breasts" })).toBeInTheDocument();

    // Transfer second item out of Freezer
    const peasLink = screen.getByRole("link", { name: "Peas, Frozen" });
    const peasRow = peasLink.closest("div.p-3") as HTMLElement;
    fireEvent.click(within(peasRow).getByRole("button", { name: /Transfer/i }));
    fireEvent.click(screen.getByRole("button", { name: /Destination location for Peas, Frozen/i }));
    fireEvent.click(screen.getByRole("button", { name: /^Fridge$/i }));
    fireEvent.click(screen.getByRole("button", { name: /Confirm Transfer/i }));
    await waitFor(() => expect(screen.queryByRole("link", { name: "Peas, Frozen" })).not.toBeInTheDocument());
  });

  it("supports inline editing and clearing item notes on Item QR screen", async () => {
    let currentItem = makeItem({ notes: "Organic" });

    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url === "/api/locations") return Promise.resolve(jsonResp({ locations: sampleLocations }));
      if (url === "/api/scan/resolve") {
        return Promise.resolve(jsonResp({ kind: "item", item: currentItem, product: sampleProduct }));
      }
      if (url === "/api/items/42" && init?.method === "PATCH") {
        const patch = JSON.parse(String(init.body));
        currentItem = { ...currentItem, ...patch };
        return Promise.resolve(jsonResp({ item: currentItem }));
      }
      return Promise.reject(new Error(`unexpected fetch ${url}`));
    });

    renderQrRoute("/go/i/42");
    expect(await screen.findByText("Organic")).toBeInTheDocument();

    // Edit note
    fireEvent.click(screen.getByRole("button", { name: "Edit note" }));
    const textarea = screen.getByLabelText("Item notes");
    expect(textarea).toHaveValue("Organic");
    fireEvent.change(textarea, { target: { value: "  Half gallon remaining  " } });
    fireEvent.click(screen.getByRole("button", { name: /Save Note/i }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/items/42",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ notes: "Half gallon remaining" }),
        })
      )
    );
    expect(await screen.findByText("Half gallon remaining")).toBeInTheDocument();

    // Clear note
    fireEvent.click(screen.getByRole("button", { name: "Edit note" }));
    fireEvent.change(screen.getByLabelText("Item notes"), { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: /Save Note/i }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/items/42",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ notes: null }),
        })
      )
    );
    expect(await screen.findByRole("button", { name: /Add note/i })).toBeInTheDocument();
  });
});

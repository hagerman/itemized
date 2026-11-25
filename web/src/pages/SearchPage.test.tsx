import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SearchPage } from "./SearchPage";
import { ProductDetailPage } from "./ProductDetailPage";

const MOCK_SEARCH_PRODUCTS = [
  { id: 1, name: "Coca-Cola Original Taste Soda", in_stock_count: 3 },
  { id: 2, name: "Ginger Ale Soda", in_stock_count: 1 },
];

const MOCK_PRODUCT_DETAIL = {
  product: {
    id: 1,
    name: "Coca-Cola Original Taste Soda",
    category_id: 1,
    category_name: "Beverages",
    default_location_id: 1,
    default_location_name: "Fridge",
    default_due_days: 30,
    default_due_days_on_open: null,
    default_due_days_on_freeze: null,
    default_due_days_on_thaw: null,
    use_average_for_due_date: false,
    label_print_mode: "per_item",
    minimum_value: null,
    manually_added_to_shopping_list: false,
    volume_value: null,
    volume_unit: null,
    weight_value: null,
    weight_unit: null,
    length_value: null,
    length_unit: null,
    in_stock_count: 3,
    next_due_on_date: null,
    next_location_name: "Fridge",
    on_shopping_list: false,
    low_stock: false,
    low_stock_amount: null,
    due_soon: false,
    overdue: false,
  },
  variants: [],
  items: [],
};

const LocationAndBackControls = () => {
  const loc = useLocation();
  const navigate = useNavigate();
  return (
    <div>
      <div data-testid="current-url">{loc.pathname + loc.search}</div>
      <button type="button" onClick={() => navigate(-1)}>
        Browser Back
      </button>
    </div>
  );
};

describe("SearchPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("queries products, syncs ?q= in URL, and restores search results on both in-app back and browser back", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.startsWith("/api/products?status=all&q=")) {
        return new Response(JSON.stringify({ products: MOCK_SEARCH_PRODUCTS }), { status: 200 });
      }
      if (url === "/api/products/1") {
        return new Response(JSON.stringify(MOCK_PRODUCT_DETAIL), { status: 200 });
      }
      return new Response(JSON.stringify({ locations: [] }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={["/search"]}>
          <LocationAndBackControls />
          <Routes>
            <Route path="/search" element={<SearchPage />} />
            <Route path="/products/:id" element={<ProductDetailPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );

    // Initial empty search omits divider and empty-results message
    expect(screen.queryByRole("separator")).not.toBeInTheDocument();
    expect(screen.queryByText("No products match this search.")).not.toBeInTheDocument();

    const input = screen.getByPlaceholderText("Search products...") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "soda" } });

    expect(screen.getByTestId("current-url").textContent).toBe("/search?q=soda");
    await waitFor(() => expect(screen.getByText("Coca-Cola Original Taste Soda")).toBeInTheDocument());
    expect(screen.getByRole("separator")).toBeInTheDocument();
    expect(screen.queryByText("No products match this search.")).not.toBeInTheDocument();
    expect(screen.getByText("3 in stock")).toBeInTheDocument();
    expect(screen.getByText("Ginger Ale Soda")).toBeInTheDocument();

    // Navigate to a search result
    fireEvent.click(screen.getByText("Coca-Cola Original Taste Soda"));
    await waitFor(() => expect(screen.getByTestId("current-url").textContent).toBe("/products/1"));

    // Browser back returns to /search?q=soda with prior search results intact
    fireEvent.click(screen.getByRole("button", { name: "Browser Back" }));
    await waitFor(() => expect(screen.getByTestId("current-url").textContent).toBe("/search?q=soda"));
    expect((screen.getByPlaceholderText("Search products...") as HTMLInputElement).value).toBe("soda");
    expect(screen.getByText("Coca-Cola Original Taste Soda")).toBeInTheDocument();
    expect(screen.getByText("Ginger Ale Soda")).toBeInTheDocument();

    // Navigate to result again and use ProductDetailPage's in-app back link
    fireEvent.click(screen.getByText("Coca-Cola Original Taste Soda"));
    const backLink = await waitFor(() => screen.getByRole("link", { name: "Back to search results" }));
    fireEvent.click(backLink);
    await waitFor(() => expect(screen.getByTestId("current-url").textContent).toBe("/search?q=soda"));
    expect((screen.getByPlaceholderText("Search products...") as HTMLInputElement).value).toBe("soda");
    expect(screen.getByText("Ginger Ale Soda")).toBeInTheDocument();
  });

  it("shows divider and empty-results message when a non-empty search returns no products, and hides both when cleared", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ products: [] }), { status: 200 }))
    );

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={["/search"]}>
          <Routes>
            <Route path="/search" element={<SearchPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );

    expect(screen.queryByRole("separator")).not.toBeInTheDocument();

    const input = screen.getByPlaceholderText("Search products...") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "nonexistent" } });

    await waitFor(() => expect(screen.getByText("No products match this search.")).toBeInTheDocument());
    expect(screen.getByRole("separator")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
    expect(screen.queryByRole("separator")).not.toBeInTheDocument();
    expect(screen.queryByText("No products match this search.")).not.toBeInTheDocument();
  });
});

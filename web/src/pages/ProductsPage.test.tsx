import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ProductsPage } from "./ProductsPage";

const MOCK_PRODUCTS = [
  {
    id: 1,
    name: "Test",
    category_id: 1,
    category_name: "Category",
    default_location_id: 1,
    default_location_name: "Pantry",
    default_due_days: null,
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
    in_stock_count: 1,
    next_due_on_date: null,
    next_location_name: "Blah > Blah 2",
    on_shopping_list: false,
    low_stock: false,
    low_stock_amount: null,
    due_soon: false,
    overdue: false,
  },
];

describe("ProductsPage responsive index toolbar", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders a single-row container-query toolbar with compact sort dropdown button and icon-only + link", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ products: MOCK_PRODUCTS }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={["/?status=in_stock"]}>
          <ProductsPage />
        </MemoryRouter>
      </QueryClientProvider>
    );

    await waitFor(() => expect(screen.getByText("Test")).toBeInTheDocument());

    const toolbar = screen.getByTestId("products-toolbar");
    expect(toolbar).toHaveClass("@container");

    const row = screen.getByTestId("products-toolbar-row");
    expect(row).toHaveClass("flex-nowrap");

    // Full sort select is hidden below @[540px] and shown at @[540px]:
    const fullSelect = screen.getByRole("combobox", { name: "Sort products" }) as HTMLSelectElement;
    expect(fullSelect).toHaveClass("hidden", "@[540px]:block");
    expect(fullSelect.value).toBe("name");

    // Compact sort button is shown below @[540px] and opens an accessible listbox
    const sortButton = screen.getByRole("button", { name: "Sort products" });
    expect(sortButton.parentElement).toHaveClass("@[540px]:hidden");
    expect(sortButton).toHaveAttribute("aria-expanded", "false");

    // New Product link collapses its text label below @[540px]
    const newLink = screen.getByRole("link", { name: "New Product" });
    expect(newLink).toHaveAttribute("href", "/products/new");
    const newLabel = screen.getByText("New Product");
    expect(newLabel).toHaveClass("hidden", "@[540px]:inline");

    // Open compact sort dropdown, verify active selection, and switch to Soonest Due
    fireEvent.click(sortButton);
    expect(sortButton).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("listbox", { name: "Sort options" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Name" })).toHaveAttribute("aria-selected", "true");

    fireEvent.click(screen.getByRole("option", { name: "Soonest Due" }));
    expect(screen.queryByRole("listbox", { name: "Sort options" })).not.toBeInTheDocument();
    expect(fullSelect.value).toBe("due_date");

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/products?status=in_stock&sort=due_date",
        expect.anything()
      )
    );

    // Pressing Escape closes the sort menu without changing sort
    fireEvent.click(sortButton);
    expect(screen.getByRole("listbox", { name: "Sort options" })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("listbox", { name: "Sort options" })).not.toBeInTheDocument();
    expect(fullSelect.value).toBe("due_date");

    // Clicking outside closes the sort menu
    fireEvent.click(sortButton);
    expect(screen.getByRole("listbox", { name: "Sort options" })).toBeInTheDocument();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("listbox", { name: "Sort options" })).not.toBeInTheDocument();
  });

  it("renders Clear Filters without adding space-y layout shift on the toolbar container", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ products: MOCK_PRODUCTS }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={["/?status=in_stock&category_id=1"]}>
          <ProductsPage />
        </MemoryRouter>
      </QueryClientProvider>
    );

    await waitFor(() => expect(screen.getByText("Test")).toBeInTheDocument());

    const toolbar = screen.getByTestId("products-toolbar");
    expect(toolbar).toHaveClass("@container");
    expect(toolbar).not.toHaveClass("space-y-2");

    const row = screen.getByTestId("products-toolbar-row");
    const clearButtons = screen.getAllByRole("button", { name: /Clear Filters/i });
    expect(clearButtons).toHaveLength(2);

    const [inlineClear, wrappedClear] = clearButtons;
    expect(row).toContainElement(inlineClear);
    expect(inlineClear).toHaveClass("hidden", "@[640px]:flex");

    expect(row).not.toContainElement(wrappedClear);
    expect(wrappedClear.parentElement).toHaveClass("mt-2", "flex", "@[640px]:hidden");
  });
});

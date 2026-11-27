import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ProductsPage } from "./ProductsPage";
import { ScannerControlContext } from "../components/Layout";

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

const RICH_MOCK_PRODUCTS = [
  {
    ...MOCK_PRODUCTS[0],
    id: 1,
    name: "Milk",
    category_name: "Dairy",
    next_location_name: "Fridge",
    in_stock_count: 2,
    next_due_on_date: "2026-11-20",
    overdue: true,
    due_soon: false,
    on_shopping_list: true,
    low_stock_amount: 3,
  },
  {
    ...MOCK_PRODUCTS[0],
    id: 2,
    name: "Yogurt",
    category_name: "Dairy",
    next_location_name: "Fridge > Top Shelf",
    in_stock_count: 4,
    next_due_on_date: "2026-11-27",
    overdue: false,
    due_soon: true,
    on_shopping_list: false,
    low_stock_amount: null,
  },
  {
    ...MOCK_PRODUCTS[0],
    id: 3,
    name: "Rice",
    category_name: "Pantry Staples",
    next_location_name: "",
    in_stock_count: 0,
    next_due_on_date: "2027-01-15",
    overdue: false,
    due_soon: false,
    on_shopping_list: true,
    low_stock_amount: null,
  },
];

function renderProductsPage(initialEntry = "/?status=in_stock") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/" element={<ProductsPage />} />
          <Route path="/products/:id" element={<div data-testid="product-detail-route">Product Detail</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("ProductsPage responsive index toolbar", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders a single-row container-query toolbar with compact sort dropdown button and icon-only + link", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ products: MOCK_PRODUCTS }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    renderProductsPage("/?status=in_stock");

    await waitFor(() => expect(screen.getByTestId("products-table")).toBeInTheDocument());

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

    renderProductsPage("/?status=in_stock&category_id=1");

    await waitFor(() => expect(screen.getByTestId("products-table")).toBeInTheDocument());

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

describe("ProductsPage desktop table view, sorting, and bulk deletion", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders a desktop table (hidden md:block) with columns and badges and a checkbox-free mobile card list (md:hidden)", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ products: RICH_MOCK_PRODUCTS }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    renderProductsPage("/?status=all");

    const tableContainer = await screen.findByTestId("products-table");
    const cardContainer = screen.getByTestId("products-card-list");

    expect(tableContainer).toHaveClass("hidden", "md:block");
    expect(cardContainer).toHaveClass("md:hidden");
    expect(within(cardContainer).queryAllByRole("checkbox")).toHaveLength(0);

    const table = within(tableContainer).getByRole("table");
    const rows = within(table).getAllByRole("row");
    // 1 header row + 3 product rows
    expect(rows).toHaveLength(4);

    // Row 1: Milk (Overdue + Need 3)
    const milkRow = rows[1];
    expect(within(milkRow).getByRole("checkbox", { name: "Select Milk" })).toBeInTheDocument();
    expect(within(milkRow).getByRole("link", { name: "Milk" })).toHaveAttribute("href", "/products/1");
    expect(within(milkRow).getByText("Dairy")).toBeInTheDocument();
    expect(within(milkRow).getByText("Fridge")).toBeInTheDocument();
    expect(within(milkRow).getByText("2")).toBeInTheDocument();
    expect(within(milkRow).getByText("Overdue (2026-11-20)")).toBeInTheDocument();
    expect(within(milkRow).getByText("Need 3")).toBeInTheDocument();

    // Row 2: Yogurt (Due Soon, not on shopping list)
    const yogurtRow = rows[2];
    expect(within(yogurtRow).getByText("Due 2026-11-27")).toBeInTheDocument();
    expect(within(yogurtRow).getByText("—")).toBeInTheDocument();

    // Row 3: Rice (No location -> —, plain due date, Shopping List)
    const riceRow = rows[3];
    expect(within(riceRow).getByText("—")).toBeInTheDocument();
    expect(within(riceRow).getByText("2027-01-15")).toBeInTheDocument();
    expect(within(riceRow).getByText("Shopping List")).toBeInTheDocument();
  });

  it("navigates to product detail when clicking a table row, but not when clicking a checkbox", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ products: RICH_MOCK_PRODUCTS }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    renderProductsPage("/?status=in_stock");

    const tableContainer = await screen.findByTestId("products-table");
    const checkbox = within(tableContainer).getByRole("checkbox", { name: "Select Milk" });

    // Clicking the checkbox toggles selection without navigating
    fireEvent.click(checkbox);
    expect(checkbox).toBeChecked();
    expect(screen.queryByTestId("product-detail-route")).not.toBeInTheDocument();

    // Clicking a non-interactive cell in the row navigates to /products/:id
    fireEvent.click(within(tableContainer).getByText("Fridge"));
    expect(await screen.findByTestId("product-detail-route")).toBeInTheDocument();
  });

  it("updates sort order and aria-sort when clicking desktop table column headers", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ products: RICH_MOCK_PRODUCTS }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    renderProductsPage("/?status=in_stock");

    const tableContainer = await screen.findByTestId("products-table");
    const fullSelect = screen.getByRole("combobox", { name: "Sort products" }) as HTMLSelectElement;

    const productBtn = within(tableContainer).getByRole("button", { name: "Product" });
    const stockBtn = within(tableContainer).getByRole("button", { name: "Stock" });
    const nextDueBtn = within(tableContainer).getByRole("button", { name: "Next Due" });

    expect(productBtn.closest("th")).toHaveAttribute("aria-sort", "ascending");
    expect(stockBtn.closest("th")).not.toHaveAttribute("aria-sort");

    fireEvent.click(stockBtn);
    expect(fullSelect.value).toBe("stock");
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/products?status=in_stock&sort=stock", expect.anything())
    );
    const updatedTableAfterStock = await screen.findByTestId("products-table");
    expect(within(updatedTableAfterStock).getByRole("button", { name: "Stock" }).closest("th")).toHaveAttribute(
      "aria-sort",
      "ascending"
    );
    expect(within(updatedTableAfterStock).getByRole("button", { name: "Product" }).closest("th")).not.toHaveAttribute(
      "aria-sort"
    );

    fireEvent.click(within(updatedTableAfterStock).getByRole("button", { name: "Next Due" }));
    expect(fullSelect.value).toBe("due_date");
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/products?status=in_stock&sort=due_date", expect.anything())
    );
    const updatedTableAfterDue = await screen.findByTestId("products-table");
    expect(within(updatedTableAfterDue).getByRole("button", { name: "Next Due" }).closest("th")).toHaveAttribute(
      "aria-sort",
      "ascending"
    );
  });

  it("supports desktop bulk selection, confirmation cancellation, bulk deletion, and filter selection reset", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (init?.method === "DELETE") {
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      if (url.startsWith("/api/products")) {
        return new Response(JSON.stringify({ products: RICH_MOCK_PRODUCTS }), { status: 200 });
      }
      return new Response("{}", { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const confirmSpy = vi.spyOn(window, "confirm");

    renderProductsPage("/?status=in_stock");

    const tableContainer = await screen.findByTestId("products-table");
    expect(screen.queryByTestId("products-bulk-bar")).not.toBeInTheDocument();

    // Select all via header checkbox
    const selectAll = within(tableContainer).getByRole("checkbox", { name: "Select all products" });
    fireEvent.click(selectAll);

    const bulkBar = screen.getByTestId("products-bulk-bar");
    expect(bulkBar).toHaveClass("sticky", "bottom-4", "z-20", "hidden", "md:flex");
    expect(within(bulkBar).getByText("3 selected:")).toBeInTheDocument();

    // Canceling confirmation makes no DELETE requests
    confirmSpy.mockReturnValueOnce(false);
    fireEvent.click(within(bulkBar).getByRole("button", { name: "Delete" }));
    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "DELETE")).toHaveLength(0);

    // Uncheck one product, then confirm deletion of remaining 2
    fireEvent.click(within(tableContainer).getByRole("checkbox", { name: "Select Rice" }));
    expect(within(bulkBar).getByText("2 selected:")).toBeInTheDocument();

    confirmSpy.mockReturnValueOnce(true);
    fireEvent.click(within(bulkBar).getByRole("button", { name: "Delete" }));

    await waitFor(() => {
      const deleteUrls = fetchMock.mock.calls
        .filter(([, init]) => init?.method === "DELETE")
        .map(([url]) => String(url))
        .sort();
      expect(deleteUrls).toEqual(["/api/products/1", "/api/products/2"]);
    });

    await waitFor(() => expect(screen.queryByTestId("products-bulk-bar")).not.toBeInTheDocument());

    // Select a product again, then change the filter input -> selection clears
    fireEvent.click(within(tableContainer).getByRole("checkbox", { name: "Select Milk" }));
    expect(screen.getByTestId("products-bulk-bar")).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("Filter products..."), { target: { value: "Yogurt" } });
    await waitFor(() => expect(screen.queryByTestId("products-bulk-bar")).not.toBeInTheDocument());
  });

  it("shows Merge bulk action only when 2+ products are selected and merges via destination modal", async () => {
    let failNextMerge = false;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/products/merge" && init?.method === "POST") {
        if (failNextMerge) {
          failNextMerge = false;
          return new Response(JSON.stringify({ error: "source product not found" }), { status: 404 });
        }
        return new Response(JSON.stringify({ product: RICH_MOCK_PRODUCTS[1], merged_count: 1 }), { status: 200 });
      }
      if (url.startsWith("/api/products")) {
        return new Response(JSON.stringify({ products: RICH_MOCK_PRODUCTS }), { status: 200 });
      }
      return new Response("{}", { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    renderProductsPage("/?status=in_stock");

    const tableContainer = await screen.findByTestId("products-table");

    // Selecting 1 product shows Delete but NOT Merge
    fireEvent.click(within(tableContainer).getByRole("checkbox", { name: "Select Milk" }));
    const bulkBar = screen.getByTestId("products-bulk-bar");
    expect(within(bulkBar).getByRole("button", { name: "Delete" })).toBeInTheDocument();
    expect(within(bulkBar).queryByRole("button", { name: "Merge" })).not.toBeInTheDocument();

    // Selecting a 2nd product reveals Merge
    fireEvent.click(within(tableContainer).getByRole("checkbox", { name: "Select Yogurt" }));
    const mergeBtn = within(bulkBar).getByRole("button", { name: "Merge" });
    expect(mergeBtn).toBeInTheDocument();

    // Opening modal lists selected products and dismisses on backdrop click
    fireEvent.click(mergeBtn);
    const dialog = screen.getByRole("dialog", { name: "Merge Products" });
    expect(within(dialog).getByRole("radio", { name: /Milk/ })).toBeChecked();
    expect(within(dialog).getByRole("radio", { name: /Yogurt/ })).not.toBeChecked();
    expect(within(dialog).queryByRole("radio", { name: /Rice/ })).not.toBeInTheDocument();

    fireEvent.mouseDown(dialog);
    fireEvent.click(dialog);
    expect(screen.queryByRole("dialog", { name: "Merge Products" })).not.toBeInTheDocument();

    // Reopen and dismiss via Escape
    fireEvent.click(mergeBtn);
    expect(screen.getByRole("dialog", { name: "Merge Products" })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Merge Products" })).not.toBeInTheDocument();

    // Reopen, choose Yogurt as destination, test API error keeps modal & selection open
    fireEvent.click(mergeBtn);
    const openDialog = screen.getByRole("dialog", { name: "Merge Products" });
    fireEvent.click(within(openDialog).getByRole("radio", { name: /Yogurt/ }));

    failNextMerge = true;
    fireEvent.click(within(openDialog).getByRole("button", { name: "Confirm Merge" }));
    await waitFor(() => expect(within(openDialog).getByRole("alert")).toHaveTextContent("source product not found"));
    expect(screen.getByTestId("products-bulk-bar")).toBeInTheDocument();

    // Retry succeeds: posts target_product_id=2, source_product_ids=[1], closes modal, clears selection, refreshes
    const listCallsBefore = fetchMock.mock.calls.filter(([u]) => String(u).startsWith("/api/products?")).length;
    fireEvent.click(within(openDialog).getByRole("button", { name: "Confirm Merge" }));

    await waitFor(() => {
      const mergeCalls = fetchMock.mock.calls.filter(([u, init]) => String(u) === "/api/products/merge" && init?.method === "POST");
      expect(mergeCalls).toHaveLength(2);
      expect(JSON.parse(String(mergeCalls[1][1]?.body))).toEqual({
        target_product_id: 2,
        source_product_ids: [1],
      });
    });

    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Merge Products" })).not.toBeInTheDocument());
    await waitFor(() => expect(screen.queryByTestId("products-bulk-bar")).not.toBeInTheDocument());
    await waitFor(() => {
      const listCallsAfter = fetchMock.mock.calls.filter(([u]) => String(u).startsWith("/api/products?")).length;
      expect(listCallsAfter).toBeGreaterThan(listCallsBefore);
    });
  });

  it("supports bulk Reclassify when LLM is enabled with editable review, exclusions, live merge preview, and apply", async () => {
    const sampleProducts = [
      {
        id: 1,
        name: "Meat, Chicken, Breast",
        category_id: 1,
        category_name: "Meat & Seafood",
        default_location_id: 1,
        default_location_name: "Fridge",
        in_stock_count: 1,
        next_due_on_date: null,
        next_location_name: "Fridge",
        on_shopping_list: false,
        low_stock: false,
        low_stock_amount: null,
        due_soon: false,
        overdue: false,
      },
      {
        id: 2,
        name: "Chicken, Breast",
        category_id: 1,
        category_name: "Meat & Seafood",
        default_location_id: 1,
        default_location_name: "Fridge",
        in_stock_count: 3,
        next_due_on_date: null,
        next_location_name: "Fridge",
        on_shopping_list: false,
        low_stock: false,
        low_stock_amount: null,
        due_soon: false,
        overdue: false,
      },
      {
        id: 3,
        name: "Apple, Gala",
        category_id: 2,
        category_name: "Produce",
        default_location_id: 1,
        default_location_name: "Fridge",
        in_stock_count: 2,
        next_due_on_date: null,
        next_location_name: "Fridge",
        on_shopping_list: false,
        low_stock: false,
        low_stock_amount: null,
        due_soon: false,
        overdue: false,
      },
      {
        id: 4,
        name: "Rice, Basmati",
        category_id: 3,
        category_name: "Pantry",
        default_location_id: 2,
        default_location_name: "Pantry",
        in_stock_count: 1,
        next_due_on_date: null,
        next_location_name: "Pantry",
        on_shopping_list: false,
        low_stock: false,
        low_stock_amount: null,
        due_soon: false,
        overdue: false,
      },
    ];

    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api/auth/status") {
        return new Response(
          JSON.stringify({ initialized: true, oidc_enabled: false, oidc_force: false, llm_enabled: true, user: { id: 1, email: "a@b.c", role: "admin" } }),
          { status: 200 }
        );
      }
      if (url.startsWith("/api/products?")) {
        return new Response(JSON.stringify({ products: sampleProducts }), { status: 200 });
      }
      if (url === "/api/products/reclassify/suggest" && init?.method === "POST") {
        return new Response(
          JSON.stringify({
            suggestions: [
              { product_id: 1, current_name: "Meat, Chicken, Breast", suggested_name: "Chicken, Breast" },
              { product_id: 3, current_name: "Apple, Gala", suggested_name: "Apples, Gala" },
              { product_id: 4, current_name: "Rice, Basmati", suggested_name: "Rice, Basmati" },
            ],
          }),
          { status: 200 }
        );
      }
      if (url === "/api/products/reclassify/apply" && init?.method === "POST") {
        return new Response(JSON.stringify({ renamed: 1, merged: 1 }), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={["/"]}>
          <Routes>
            <Route path="/" element={<ProductsPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );

    const tableContainer = await screen.findByTestId("products-table");
    fireEvent.click(within(tableContainer).getByRole("checkbox", { name: "Select Meat, Chicken, Breast" }));
    fireEvent.click(within(tableContainer).getByRole("checkbox", { name: "Select Apple, Gala" }));
    fireEvent.click(within(tableContainer).getByRole("checkbox", { name: "Select Rice, Basmati" }));

    const bulkBar = screen.getByTestId("products-bulk-bar");
    const reclassifyBtn = await within(bulkBar).findByRole("button", { name: "Reclassify" });
    fireEvent.click(reclassifyBtn);

    const dialog = screen.getByRole("dialog", { name: "Reclassify Products" });
    await waitFor(() =>
      expect(within(dialog).getByLabelText("New name for Meat, Chicken, Breast")).toHaveValue("Chicken, Breast")
    );

    // Unchanged row ("Rice, Basmati") defaults to unchecked
    expect(within(dialog).getByRole("checkbox", { name: "Include Rice, Basmati" })).not.toBeChecked();
    expect(within(dialog).getByRole("checkbox", { name: "Include Meat, Chicken, Breast" })).toBeChecked();
    expect(within(dialog).getByRole("checkbox", { name: "Include Apple, Gala" })).toBeChecked();

    // Live preview shows merge into unselected existing "Chicken, Breast" and rename for "Apple, Gala"
    expect(within(dialog).getByText("Merge into existing: Chicken, Breast")).toBeInTheDocument();
    expect(within(dialog).getByText("Rename")).toBeInTheDocument();

    // Tweak "Apple, Gala" name
    fireEvent.change(within(dialog).getByLabelText("New name for Apple, Gala"), {
      target: { value: "Apples, Gala, Organic" },
    });

    // Apply sends only included rows with tweaked names
    fireEvent.click(within(dialog).getByRole("button", { name: "Apply Changes" }));
    await waitFor(() => {
      const applyCalls = fetchMock.mock.calls.filter(
        ([u, init]) => String(u) === "/api/products/reclassify/apply" && init?.method === "POST"
      );
      expect(applyCalls).toHaveLength(1);
      expect(JSON.parse(String(applyCalls[0][1]?.body))).toEqual({
        items: [
          { product_id: 1, new_name: "Chicken, Breast" },
          { product_id: 3, new_name: "Apples, Gala, Organic" },
        ],
      });
    });

    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Reclassify Products" })).not.toBeInTheDocument());
    await waitFor(() => expect(screen.queryByTestId("products-bulk-bar")).not.toBeInTheDocument());
  });

  it("renders the Get Started onboarding card on a truly empty catalog, loads starter setup, triggers Scan / Action, and shows conditional HTTPS warning", async () => {
    let categories: Array<{ id: number; name: string; parent_id: number | null; hierarchy_name: string }> = [];
    let locations: Array<{ id: number; name: string; parent_id: number | null; is_freezer: boolean; hierarchy_name: string }> = [];
    const starterPayloads: unknown[] = [];
    const openScanner = vi.fn();

    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url === "/api/auth/status") {
          return new Response(
            JSON.stringify({ initialized: true, oidc_enabled: false, oidc_force: false, llm_enabled: false, user: { id: 1, email: "a@b.c", role: "admin" } }),
            { status: 200 }
          );
        }
        if (url.startsWith("/api/products?")) {
          return new Response(
            JSON.stringify({ products: [], status_counts: { in_stock: 0, shopping_list: 0, due_soon: 0, overdue: 0, all: 0 } }),
            { status: 200 }
          );
        }
        if (url === "/api/categories") {
          return new Response(JSON.stringify({ categories }), { status: 200 });
        }
        if (url === "/api/locations") {
          return new Response(JSON.stringify({ locations }), { status: 200 });
        }
        if (url === "/api/onboarding/starter-taxonomy" && init?.method === "POST") {
          starterPayloads.push(JSON.parse(String(init.body)));
          categories = [{ id: 1, name: "Groceries", parent_id: null, hierarchy_name: "Groceries" }];
          locations = [{ id: 1, name: "Kitchen", parent_id: null, is_freezer: false, hierarchy_name: "Kitchen" }];
          return new Response(
            JSON.stringify({ categories_created: 1, locations_created: 1, categories, locations }),
            { status: 200 }
          );
        }
        return new Response(JSON.stringify({}), { status: 200 });
      })
    );

    const originalSecureContext = Object.getOwnPropertyDescriptor(window, "isSecureContext");
    Object.defineProperty(window, "isSecureContext", { value: true, configurable: true });

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { unmount } = render(
      <QueryClientProvider client={qc}>
        <ScannerControlContext.Provider value={{ openScanner }}>
          <MemoryRouter initialEntries={["/"]}>
            <ProductsPage />
          </MemoryRouter>
        </ScannerControlContext.Provider>
      </QueryClientProvider>
    );

    const card = await screen.findByTestId("onboarding-card");
    expect(card).toHaveTextContent("Welcome to itemized");
    expect(screen.queryByTestId("onboarding-https-warning")).not.toBeInTheDocument();

    // Load Starter Setup button calls starter-taxonomy and switches step 1 to completed
    fireEvent.click(screen.getByRole("button", { name: /Load Starter Setup/i }));
    await waitFor(() => expect(starterPayloads).toEqual([{ categories: true, locations: true }]));
    await waitFor(() => expect(screen.getByLabelText("Completed")).toBeInTheDocument());

    // Scan / Action button opens scanner in purchase mode
    fireEvent.click(within(card).getByRole("button", { name: /Scan \/ Action/i }));
    expect(openScanner).toHaveBeenCalledWith("purchase");
    unmount();

    // Insecure non-localhost context shows HTTPS warning
    Object.defineProperty(window, "isSecureContext", { value: false, configurable: true });
    const originalLocation = window.location;
    Object.defineProperty(window, "location", {
      value: { ...originalLocation, hostname: "192.168.1.50" },
      configurable: true,
    });

    const qc2 = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc2}>
        <ScannerControlContext.Provider value={{ openScanner }}>
          <MemoryRouter initialEntries={["/"]}>
            <ProductsPage />
          </MemoryRouter>
        </ScannerControlContext.Provider>
      </QueryClientProvider>
    );

    expect(await screen.findByTestId("onboarding-https-warning")).toBeInTheDocument();

    Object.defineProperty(window, "location", { value: originalLocation, configurable: true });
    if (originalSecureContext) {
      Object.defineProperty(window, "isSecureContext", originalSecureContext);
    }
  });

  it("invalidates product, list, search, and location caches on bulk delete", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url === "/api/auth/status") {
          return new Response(
            JSON.stringify({ initialized: true, oidc_enabled: false, oidc_force: false, llm_enabled: false, user: { id: 1, email: "a@b.c", role: "admin" } }),
            { status: 200 }
          );
        }
        if (url === "/api/products/1" && init?.method === "DELETE") {
          return new Response(JSON.stringify({ ok: true }), { status: 200 });
        }
        if (url.startsWith("/api/products?")) {
          return new Response(JSON.stringify({ products: RICH_MOCK_PRODUCTS }), { status: 200 });
        }
        return new Response(JSON.stringify({ categories: [], locations: [] }), { status: 200 });
      })
    );
    vi.spyOn(window, "confirm").mockReturnValue(true);

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 15_000 } } });
    const invalidateSpy = vi.spyOn(qc, "invalidateQueries");

    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={["/?status=in_stock"]}>
          <Routes>
            <Route path="/" element={<ProductsPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );

    await waitFor(() => expect(screen.getByTestId("products-table")).toBeInTheDocument());
    fireEvent.click(screen.getByLabelText("Select Milk"));
    fireEvent.click(screen.getByRole("button", { name: /^Delete$/i }));

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["products"] });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["product"] });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["quick-search"] });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["location"] });
    });
  });
});

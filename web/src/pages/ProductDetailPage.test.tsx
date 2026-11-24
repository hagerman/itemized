import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ProductDetailPage } from "./ProductDetailPage";

const MOCK_PRODUCT_RESPONSE = {
  product: {
    id: 1,
    name: "Coca-Cola Original Taste Soda",
    category_id: 1,
    category_name: "Beverages",
    default_location_id: 2,
    default_location_name: "Pantry",
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
    in_stock_count: 1,
    next_due_on_date: "2026-12-04",
    next_location_name: "Fridge",
    on_shopping_list: false,
    low_stock: false,
    low_stock_amount: null,
    due_soon: false,
    overdue: false,
  },
  variants: [
    {
      id: 10,
      product_id: 1,
      name: "Default",
      volume_value: null,
      volume_unit: null,
      weight_value: null,
      weight_unit: null,
      length_value: null,
      length_unit: null,
      barcodes: [{ id: 100, variant_id: 10, barcode: "049000028904", default_quantity: 1 }],
    },
    {
      id: 11,
      product_id: 1,
      name: "12-Pack",
      volume_value: null,
      volume_unit: null,
      weight_value: null,
      weight_unit: null,
      length_value: null,
      length_unit: null,
      barcodes: [],
    },
  ],
  items: [
    {
      id: 5,
      product_id: 1,
      product_name: "Coca-Cola Original Taste Soda",
      variant_id: 10,
      variant_name: "Default",
      location_id: 1,
      location_name: "Fridge",
      purchased_on_date: "2026-11-22",
      opened_on_date: null,
      due_on_date: "2026-12-04",
      consumed_on_date: null,
      notes: null,
    },
  ],
};

describe("ProductDetailPage responsive layout and variant/barcode management", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders accessible header actions, mobile item cards, and supports inline variant & barcode management", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api/products/1" && !init?.method) {
        return new Response(JSON.stringify(MOCK_PRODUCT_RESPONSE), { status: 200 });
      }
      if (url === "/api/locations") {
        return new Response(JSON.stringify({ locations: [{ id: 1, name: "Fridge", parent_id: null, is_freezer: false, hierarchy_name: "Fridge" }] }), { status: 200 });
      }
      if (url === "/api/variants/10" && init?.method === "PATCH") {
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      }
      if (url === "/api/variants/10/barcodes" && init?.method === "POST") {
        return new Response(JSON.stringify({ error: "barcode already exists" }), { status: 409 });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={["/products/1"]}>
          <Routes>
            <Route path="/products/:id" element={<ProductDetailPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );

    await waitFor(() => expect(screen.getByText("Coca-Cola Original Taste Soda")).toBeInTheDocument());

    // Header shows next-due item location ("Fridge") rather than default location ("Pantry")
    expect(screen.getByText(/Beverages\s*•\s*Fridge/)).toBeInTheDocument();
    expect(screen.queryByText(/Pantry/)).not.toBeInTheDocument();

    // Label Mode renders human-readable text rather than raw slug
    expect(screen.getByText("One label per item")).toBeInTheDocument();
    expect(screen.queryByText("per_item")).not.toBeInTheDocument();

    // Accessible header buttons
    expect(screen.getByRole("button", { name: "Add to Shopping List" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Print Product Label" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Edit Product" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete Product" })).toBeInTheDocument();

    // Item omits #id, displays variant first without "Variant:" prefix, and has no inline per-item select
    expect(screen.getByTestId("item-variant-5").textContent).toBe("Default");
    expect(screen.queryByText("#5")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Variant for item #5")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Mobile variant for item #5")).not.toBeInTheDocument();

    // Mobile stacked item card exists and supports bulk selection + bulk variant update
    expect(screen.getByTestId("items-mobile-list")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Select item #5"));
    expect(screen.getByText("1 selected:")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Bulk variant"), { target: { value: "11" } });
    fireEvent.click(screen.getByRole("button", { name: "Set Variant" }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/items/bulk",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            action: "update_variant",
            item_ids: [5],
            variant_id: 11,
          }),
        })
      )
    );

    // Edit variant inline
    fireEvent.click(screen.getByRole("button", { name: "Edit variant Default" }));
    const editInput = screen.getByLabelText("Edit variant name");
    fireEvent.change(editInput, { target: { value: "12 oz Can" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/variants/10",
        expect.objectContaining({ method: "PATCH" })
      )
    );

    // Scan-to-fill barcode modal populates the variant's barcode input, and 409 error is surfaced
    fireEvent.click(screen.getByRole("button", { name: "Scan barcode for Default" }));
    const modalInput = screen.getByLabelText("Barcode or search input");
    fireEvent.change(modalInput, { target: { value: "049000028904" } });
    fireEvent.submit(modalInput.closest("form")!);

    const barcodeInput = screen.getByLabelText("Barcode for Default") as HTMLInputElement;
    expect(barcodeInput.value).toBe("049000028904");
    fireEvent.submit(barcodeInput.closest("form")!);
    await waitFor(() => expect(screen.getByText("barcode already exists")).toBeInTheDocument());
  });

  it("displays calculated rolling-average due days as ~X when use_average_for_due_date is enabled", async () => {
    const rollingResp = {
      ...MOCK_PRODUCT_RESPONSE,
      product: {
        ...MOCK_PRODUCT_RESPONSE.product,
        default_due_days: null,
        use_average_for_due_date: true,
        calculated_due_days: 14,
      },
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url === "/api/products/1") {
          return new Response(JSON.stringify(rollingResp), { status: 200 });
        }
        return new Response(JSON.stringify({ locations: [] }), { status: 200 });
      })
    );

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={["/products/1"]}>
          <Routes>
            <Route path="/products/:id" element={<ProductDetailPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );

    await waitFor(() => expect(screen.getByTestId("default-due-days-value")).toHaveTextContent("~14"));
  });

  it("closes the Barcode Scan modal when clicking outside the dialog panel", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url === "/api/products/1") {
          return new Response(JSON.stringify(MOCK_PRODUCT_RESPONSE), { status: 200 });
        }
        return new Response(JSON.stringify({ locations: [] }), { status: 200 });
      })
    );

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={["/products/1"]}>
          <Routes>
            <Route path="/products/:id" element={<ProductDetailPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );

    const scanBtn = await waitFor(() => screen.getByRole("button", { name: "Scan barcode for Default" }));
    fireEvent.click(scanBtn);

    const dialog = screen.getByRole("dialog", { name: "Scan Variant Barcode" });
    const modalInput = screen.getByLabelText("Barcode or search input");

    // Clicking inside keeps the modal open
    fireEvent.mouseDown(modalInput);
    fireEvent.click(modalInput);
    expect(screen.getByRole("dialog", { name: "Scan Variant Barcode" })).toBeInTheDocument();

    // Clicking the backdrop closes the modal
    fireEvent.mouseDown(dialog);
    fireEvent.click(dialog);
    expect(screen.queryByRole("dialog", { name: "Scan Variant Barcode" })).not.toBeInTheDocument();
  });
});

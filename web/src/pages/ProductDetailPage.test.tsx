import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
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
      if (url === "/api/auth/status") {
        return new Response(JSON.stringify({ initialized: true, oidc_enabled: false, oidc_force: false, printers_enabled: true, user: { id: 1, email: "a@b.c", role: "admin" } }), { status: 200 });
      }
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

    // Header wraps horizontally instead of forcing flex-col, and actions are right-aligned
    const header = screen.getByTestId("product-detail-header");
    expect(header).toHaveClass("flex-wrap");
    expect(header).not.toHaveClass("flex-col");
    const headerActions = screen.getByTestId("product-detail-header-actions");
    expect(headerActions).toHaveClass("ml-auto", "justify-end");

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

  it("links the back button to location.state.from when navigated from search, defaulting to /", async () => {
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
    const { unmount } = render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={[{ pathname: "/products/1", state: { from: "/search?q=cola" } }]}>
          <Routes>
            <Route path="/products/:id" element={<ProductDetailPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );

    const searchBack = await waitFor(() => screen.getByRole("link", { name: "Back to search results" }));
    expect(searchBack).toHaveAttribute("href", "/search?q=cola");

    unmount();

    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={["/products/1"]}>
          <Routes>
            <Route path="/products/:id" element={<ProductDetailPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );

    const defaultBack = await waitFor(() => screen.getByRole("link", { name: "Back to inventory" }));
    expect(defaultBack).toHaveAttribute("href", "/");
  });

  it("renders all bulk item action controls at a uniform h-8 height", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url === "/api/auth/status") {
          return new Response(JSON.stringify({ initialized: true, oidc_enabled: false, oidc_force: false, printers_enabled: true, user: { id: 1, email: "a@b.c", role: "admin" } }), { status: 200 });
        }
        if (url === "/api/products/1") {
          return new Response(JSON.stringify(MOCK_PRODUCT_RESPONSE), { status: 200 });
        }
        if (url === "/api/locations") {
          return new Response(
            JSON.stringify({
              locations: [{ id: 1, name: "Fridge", parent_id: null, is_freezer: false, hierarchy_name: "Fridge" }],
            }),
            { status: 200 }
          );
        }
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
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

    await waitFor(() => expect(screen.getByLabelText("Select item #5")).toBeInTheDocument());
    fireEvent.click(screen.getByLabelText("Select item #5"));

    const bulkBar = screen.getByText("1 selected:").closest("div")!;
    const bar = within(bulkBar);

    // Reveal conditional confirmation buttons (Move, Set Due, Set Variant)
    fireEvent.click(bar.getByRole("button", { name: "Bulk transfer location" }));
    fireEvent.click(screen.getByRole("button", { name: "Fridge" }));
    fireEvent.change(bar.getByLabelText("Bulk due date"), { target: { value: "2027-01-17" } });
    fireEvent.change(bar.getByLabelText("Bulk variant"), { target: { value: "11" } });

    const controls = [
      bar.getByRole("button", { name: "Consume" }),
      bar.getByRole("button", { name: "Open" }),
      bar.getByRole("button", { name: "Reprint Labels" }),
      bar.getByRole("button", { name: "Bulk transfer location" }),
      bar.getByRole("button", { name: "Move" }),
      bar.getByLabelText("Bulk due date"),
      bar.getByRole("button", { name: "Set Due" }),
      bar.getByLabelText("Bulk variant"),
      bar.getByRole("button", { name: "Set Variant" }),
    ];

    for (const control of controls) {
      expect(control).toHaveClass("h-8");
    }
  });

  it("omits print buttons and Label Mode when no printers are configured", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url === "/api/auth/status") {
          return new Response(
            JSON.stringify({ initialized: true, oidc_enabled: false, oidc_force: false, printers_enabled: false, user: { id: 1, email: "a@b.c", role: "member" } }),
            { status: 200 }
          );
        }
        if (url === "/api/products/1") {
          return new Response(JSON.stringify(MOCK_PRODUCT_RESPONSE), { status: 200 });
        }
        if (url === "/api/locations") {
          return new Response(JSON.stringify({ locations: [{ id: 1, name: "Fridge", parent_id: null, is_freezer: false, hierarchy_name: "Fridge" }] }), { status: 200 });
        }
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
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

    await waitFor(() => expect(screen.getByText("Coca-Cola Original Taste Soda")).toBeInTheDocument());

    // Header Print Label button and Label Mode metadata tile are omitted
    expect(screen.queryByRole("button", { name: "Print Product Label" })).not.toBeInTheDocument();
    expect(screen.queryByText("Label Mode")).not.toBeInTheDocument();
    expect(screen.queryByText("One label per item")).not.toBeInTheDocument();

    // Per-item Print buttons (mobile and desktop) are omitted
    expect(screen.queryByRole("button", { name: "Print" })).not.toBeInTheDocument();

    // Bulk action bar omits Reprint Labels
    fireEvent.click(screen.getByLabelText("Select item #5"));
    expect(screen.getByText("1 selected:")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reprint Labels" })).not.toBeInTheDocument();
  });

  it("removes product detail cache and invalidates inventory caches when deleting a product", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url === "/api/auth/status") {
          return new Response(
            JSON.stringify({ initialized: true, oidc_enabled: false, oidc_force: false, printers_enabled: false, user: { id: 1, email: "a@b.c", role: "admin" } }),
            { status: 200 }
          );
        }
        if (url === "/api/products/1" && (!init?.method || init.method === "GET")) {
          return new Response(JSON.stringify(MOCK_PRODUCT_RESPONSE), { status: 200 });
        }
        if (url === "/api/products/1" && init?.method === "DELETE") {
          return new Response(JSON.stringify({ ok: true }), { status: 200 });
        }
        if (url === "/api/locations") {
          return new Response(JSON.stringify({ locations: [{ id: 1, name: "Fridge", parent_id: null, is_freezer: false, hierarchy_name: "Fridge" }] }), { status: 200 });
        }
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      })
    );
    vi.spyOn(window, "confirm").mockReturnValue(true);

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 15_000 } } });
    const removeSpy = vi.spyOn(qc, "removeQueries");
    const invalidateSpy = vi.spyOn(qc, "invalidateQueries");

    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={["/products/1"]}>
          <Routes>
            <Route path="/products/:id" element={<ProductDetailPage />} />
            <Route path="/" element={<div>Inventory Home</div>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );

    await waitFor(() => expect(screen.getByText("Coca-Cola Original Taste Soda")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Delete Product" }));

    expect(await screen.findByText("Inventory Home")).toBeInTheDocument();
    expect(removeSpy).toHaveBeenCalledWith({ queryKey: ["product", "1"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["products"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["product"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["quick-search"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["location"] });
  });

  it("renders cleanly when a variant omits barcodes in the API response", async () => {
    const responseWithoutBarcodes = {
      ...MOCK_PRODUCT_RESPONSE,
      variants: [
        {
          id: 12,
          product_id: 1,
          name: "Legacy Imported Variant",
          volume_value: null,
          volume_unit: null,
          weight_value: null,
          weight_unit: null,
          length_value: null,
          length_unit: null,
          // barcodes intentionally omitted (simulating legacy/partial payload)
        },
      ],
    };

    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url === "/api/auth/status") {
          return new Response(
            JSON.stringify({ initialized: true, oidc_enabled: false, oidc_force: false, printers_enabled: false, user: { id: 1, email: "a@b.c", role: "admin" } }),
            { status: 200 }
          );
        }
        if (url === "/api/products/1") {
          return new Response(JSON.stringify(responseWithoutBarcodes), { status: 200 });
        }
        if (url === "/api/locations") {
          return new Response(JSON.stringify({ locations: [] }), { status: 200 });
        }
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
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

    await waitFor(() => expect(screen.getByText("Legacy Imported Variant")).toBeInTheDocument());
    expect(screen.getByLabelText("Barcode for Legacy Imported Variant")).toBeInTheDocument();
  });

  it("displays existing item notes and supports adding, editing, and clearing notes inline", async () => {
    let currentNotes: string | null = "Imported from legacy app";

    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api/auth/status") {
        return new Response(
          JSON.stringify({ initialized: true, oidc_enabled: false, oidc_force: false, printers_enabled: false, user: { id: 1, email: "a@b.c", role: "admin" } }),
          { status: 200 }
        );
      }
      if (url === "/api/products/1" && (!init?.method || init.method === "GET")) {
        return new Response(
          JSON.stringify({
            ...MOCK_PRODUCT_RESPONSE,
            items: [{ ...MOCK_PRODUCT_RESPONSE.items[0], notes: currentNotes }],
          }),
          { status: 200 }
        );
      }
      if (url === "/api/locations") {
        return new Response(JSON.stringify({ locations: [] }), { status: 200 });
      }
      if (url === "/api/items/5" && init?.method === "PATCH") {
        const body = JSON.parse(String(init.body));
        currentNotes = body.notes ?? null;
        return new Response(
          JSON.stringify({ item: { ...MOCK_PRODUCT_RESPONSE.items[0], notes: currentNotes } }),
          { status: 200 }
        );
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

    const mobileList = screen.getByTestId("items-mobile-list");
    const desktopTable = screen.getByRole("table");

    // Existing note is rendered in both mobile card and desktop table
    expect(within(mobileList).getByText("Imported from legacy app")).toBeInTheDocument();
    expect(within(desktopTable).getByText("Imported from legacy app")).toBeInTheDocument();

    // Edit note from desktop table
    fireEvent.click(within(desktopTable).getByRole("button", { name: "Edit note for item #5" }));
    const desktopTextarea = within(desktopTable).getByLabelText("Notes for item #5");
    expect(desktopTextarea).toHaveValue("Imported from legacy app");
    fireEvent.change(desktopTextarea, { target: { value: "  Keep chilled  " } });
    fireEvent.click(within(desktopTable).getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/items/5",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ notes: "Keep chilled" }),
        })
      )
    );
    await waitFor(() => expect(within(mobileList).getByText("Keep chilled")).toBeInTheDocument());

    // Clear note from mobile card
    fireEvent.click(within(mobileList).getByRole("button", { name: "Edit note for item #5" }));
    const mobileTextarea = within(mobileList).getByLabelText("Notes for item #5");
    fireEvent.change(mobileTextarea, { target: { value: "   " } });
    fireEvent.click(within(mobileList).getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/items/5",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ notes: null }),
        })
      )
    );
    await waitFor(() =>
      expect(within(mobileList).getByRole("button", { name: "Add note for item #5" })).toBeInTheDocument()
    );

    // Add a new note to an item with null notes
    fireEvent.click(within(mobileList).getByRole("button", { name: "Add note for item #5" }));
    fireEvent.change(within(mobileList).getByLabelText("Notes for item #5"), {
      target: { value: "Opened Friday" },
    });
    fireEvent.click(within(mobileList).getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/items/5",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ notes: "Opened Friday" }),
        })
      )
    );
    await waitFor(() => expect(within(desktopTable).getByText("Opened Friday")).toBeInTheDocument());
  });

  it("ignores QR codes when scanning a variant barcode via the camera modal", async () => {
    const origSecure = Object.getOwnPropertyDescriptor(window, "isSecureContext");
    const origMediaDevices = Object.getOwnPropertyDescriptor(navigator, "mediaDevices");
    const origBarcodeDetector = Object.getOwnPropertyDescriptor(window, "BarcodeDetector");

    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url === "/api/products/1") {
          return new Response(JSON.stringify(MOCK_PRODUCT_RESPONSE), { status: 200 });
        }
        return new Response(JSON.stringify({ locations: [] }), { status: 200 });
      })
    );

    const stream = {
      getVideoTracks: () => [
        {
          getSettings: () => ({ deviceId: "cam-rear" }),
          getCapabilities: () => ({}),
          stop: vi.fn(),
        },
      ],
      getTracks: () => [{ stop: vi.fn() }],
    } as unknown as MediaStream;

    Object.defineProperty(window, "isSecureContext", { value: true, configurable: true });
    Object.defineProperty(navigator, "mediaDevices", {
      value: {
        getUserMedia: vi.fn().mockResolvedValue(stream),
        enumerateDevices: vi.fn().mockResolvedValue([]),
      },
      configurable: true,
    });
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);

    const detectWithQr = vi.fn().mockResolvedValue([
      { rawValue: "https://promo.example.com/qr", format: "qr_code" },
    ]);
    const detect1dOnly = vi.fn().mockResolvedValue([
      { rawValue: "https://promo.example.com/qr", format: "qr_code" },
      { rawValue: "049000028904", format: "upc_a" },
    ]);
    class MockBarcodeDetector {
      static async getSupportedFormats() {
        return ["qr_code", "upc_a", "ean_13"];
      }
      formats: string[];
      constructor(opts?: { formats?: string[] }) {
        this.formats = opts?.formats ?? [];
      }
      detect() {
        return this.formats.includes("qr_code") ? detectWithQr() : detect1dOnly();
      }
    }
    Object.defineProperty(window, "BarcodeDetector", {
      value: MockBarcodeDetector,
      configurable: true,
    });

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    try {
      const { container } = render(
        <QueryClientProvider client={qc}>
          <MemoryRouter initialEntries={["/products/1"]}>
            <Routes>
              <Route path="/products/:id" element={<ProductDetailPage />} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>
      );

      const scanBtn = await waitFor(() =>
        screen.getByRole("button", { name: "Scan barcode for Default" })
      );
      fireEvent.click(scanBtn);

      const dialog = screen.getByRole("dialog", { name: "Scan Variant Barcode" });
      fireEvent.click(within(dialog).getByRole("button", { name: "Start camera" }));

      const video = await waitFor(() => {
        const v = container.querySelector("video");
        expect(v).not.toBeNull();
        return v!;
      });
      Object.defineProperty(video, "readyState", { value: 4, configurable: true });
      Object.defineProperty(video, "videoWidth", { value: 1280, configurable: true });
      Object.defineProperty(video, "videoHeight", { value: 720, configurable: true });

      await waitFor(
        () => expect(screen.getByLabelText("Barcode for Default")).toHaveValue("049000028904"),
        { timeout: 2000 }
      );
      expect(detect1dOnly).toHaveBeenCalled();
      expect(detectWithQr).not.toHaveBeenCalled();
    } finally {
      if (origSecure) Object.defineProperty(window, "isSecureContext", origSecure);
      if (origMediaDevices) Object.defineProperty(navigator, "mediaDevices", origMediaDevices);
      if (origBarcodeDetector) {
        Object.defineProperty(window, "BarcodeDetector", origBarcodeDetector);
      } else {
        delete (window as unknown as Record<string, unknown>).BarcodeDetector;
      }
    }
  });
});

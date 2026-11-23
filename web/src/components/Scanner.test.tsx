import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BarcodeScanner } from "./BarcodeScanner";
import { ScannerDrawer } from "./ScannerDrawer";

describe("BarcodeScanner and ScannerDrawer", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("emits scanned value from manual/HID input and debounces duplicates", () => {
    const onScan = vi.fn();
    render(<BarcodeScanner onScan={onScan} />);

    const input = screen.getByLabelText("Barcode or search input");
    fireEvent.change(input, { target: { value: "https://my.itemizedapp.com/go/i/42" } });
    fireEvent.submit(input.closest("form")!);

    expect(onScan).toHaveBeenCalledTimes(1);
    expect(onScan).toHaveBeenCalledWith("https://my.itemizedapp.com/go/i/42");
  });

  it("switches modes without unmounting scanner and runs Consume + Undo toast", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api/scan/resolve") {
        return new Response(
          JSON.stringify({
            kind: "item",
            item: { id: 10, product_id: 1, product_name: "Milk, Whole", consumed_on_date: null },
            product: { id: 1, name: "Milk, Whole" },
          }),
          { status: 200 }
        );
      }
      if (url === "/api/items/10/consume") {
        return new Response(
          JSON.stringify({
            item: { id: 10, product_id: 1, product_name: "Milk, Whole", consumed_on_date: "2026-11-21" },
            previous: { id: 10, product_id: 1, product_name: "Milk, Whole", consumed_on_date: null },
          }),
          { status: 200 }
        );
      }
      if (url === "/api/items/10" && init?.method === "PATCH") {
        return new Response(JSON.stringify({ item: { id: 10, consumed_on_date: null } }), { status: 200 });
      }
      return new Response("{}", { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const qc = new QueryClient();
    render(
      <QueryClientProvider client={qc}>
        <ScannerDrawer
          open={true}
          initialMode="purchase"
          onClose={() => {}}
          categories={[{ id: 1, name: "Dairy", parent_id: null, hierarchy_name: "Dairy" }]}
          locations={[{ id: 1, name: "Fridge", parent_id: null, is_freezer: false, hierarchy_name: "Fridge" }]}
        />
      </QueryClientProvider>
    );

    // Switch mode to Consume
    fireEvent.click(screen.getByRole("button", { name: "Consume" }));

    const input = screen.getByLabelText("Barcode or search input");
    fireEvent.change(input, { target: { value: "https://my.itemizedapp.com/go/i/10" } });
    fireEvent.submit(input.closest("form")!);

    // Verify Undo toast appears and clicking Undo issues PATCH
    await waitFor(() => expect(screen.getByText(/Consumed Milk, Whole/)).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /Undo/i }));
    await waitFor(() => expect(screen.getByText("Action undone.")).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/items/10",
      expect.objectContaining({ method: "PATCH" })
    );
  });

  it("pairs barcode and pack quantity on the same row in Purchase and captures scan into targeted field", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url === "/api/scan/resolve") {
        return new Response(JSON.stringify({ kind: "unknown", barcode: "049000028904" }), { status: 200 });
      }
      if (url === "/api/upc/lookup") {
        return new Response(JSON.stringify({ found: false }), { status: 200 });
      }
      return new Response(JSON.stringify({ products: [] }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const qc = new QueryClient();
    render(
      <QueryClientProvider client={qc}>
        <ScannerDrawer
          open={true}
          initialMode="purchase"
          onClose={() => {}}
          categories={[{ id: 1, name: "Beverages", parent_id: null, hierarchy_name: "Beverages" }]}
          locations={[{ id: 1, name: "Fridge", parent_id: null, is_freezer: false, hierarchy_name: "Fridge" }]}
        />
      </QueryClientProvider>
    );

    // Trigger unknown barcode scan in Purchase to open Confirm & Add + Variant & Barcode Details
    const mainInput = screen.getByLabelText("Barcode or search input");
    fireEvent.change(mainInput, { target: { value: "049000028904" } });
    fireEvent.submit(mainInput.closest("form")!);

    await waitFor(() => expect(screen.getByTestId("primary-barcode-row")).toBeInTheDocument());
    expect(screen.getByTestId("second-barcode-row")).toBeInTheDocument();

    // Arm scan-to-fill on second barcode and scan a new code -> fills second barcode without calling /api/scan/resolve again
    const callsBefore = fetchMock.mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: "Scan second barcode" }));
    fireEvent.change(mainInput, { target: { value: "049000099999" } });
    fireEvent.submit(mainInput.closest("form")!);

    const secondInput = screen.getByLabelText("Second barcode") as HTMLInputElement;
    expect(secondInput.value).toBe("049000099999");
    expect(fetchMock.mock.calls.length).toBe(callsBefore);
  });

  it("shows OpenFoodFacts and LLM classification loading indicators, pre-fills variant name and measurements, and submits them", async () => {
    let resolveUpc!: (resp: Response) => void;
    let resolveClassify!: (resp: Response) => void;
    let purchaseBody: Record<string, unknown> | null = null;

    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api/scan/resolve") {
        return new Response(JSON.stringify({ kind: "unknown", barcode: "012000001291" }), { status: 200 });
      }
      if (url === "/api/upc/lookup") {
        return new Promise<Response>((resolve) => {
          resolveUpc = resolve;
        });
      }
      if (url === "/api/upc/classify") {
        return new Promise<Response>((resolve) => {
          resolveClassify = resolve;
        });
      }
      if (url === "/api/workflows/purchase") {
        purchaseBody = JSON.parse(String(init?.body || "{}"));
        return new Response(
          JSON.stringify({ product: { id: 9, name: "Soda, Cola" }, items: [{ id: 1 }] }),
          { status: 201 }
        );
      }
      return new Response(JSON.stringify({ products: [] }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const qc = new QueryClient();
    render(
      <QueryClientProvider client={qc}>
        <ScannerDrawer
          open={true}
          initialMode="purchase"
          onClose={() => {}}
          categories={[{ id: 1, name: "Beverages", parent_id: null, hierarchy_name: "Beverages" }]}
          locations={[{ id: 1, name: "Fridge", parent_id: null, is_freezer: false, hierarchy_name: "Fridge" }]}
        />
      </QueryClientProvider>
    );

    const mainInput = screen.getByLabelText("Barcode or search input");
    fireEvent.change(mainInput, { target: { value: "012000001291" } });
    fireEvent.submit(mainInput.closest("form")!);

    // Phase 1: OpenFoodFacts loading indicator appears
    await waitFor(() =>
      expect(screen.getByText("Looking up barcode in OpenFoodFacts...")).toBeInTheDocument()
    );

    // Resolve OpenFoodFacts -> banner + Variant name pre-fill + Phase 2 LLM indicator
    resolveUpc(
      new Response(
        JSON.stringify({ found: true, result: { title: "Pepsi Cola", measurement: "67.63 fl oz" } }),
        { status: 200 }
      )
    );

    await waitFor(() =>
      expect(screen.getByText("OpenFoodFacts: Pepsi Cola (67.63 fl oz)")).toBeInTheDocument()
    );
    expect(screen.getByText("Classifying product...")).toBeInTheDocument();
    expect((screen.getByLabelText("Variant name") as HTMLInputElement).value).toBe("Pepsi Cola");

    // Resolve LLM classifier -> indicator clears, measurements pre-populated
    resolveClassify(
      new Response(
        JSON.stringify({
          enabled: true,
          classification: {
            product_name: "Soda, Cola",
            product_value: 67.63,
            product_unit_type: "volume",
            product_unit: "fl_oz",
            category_id: 1,
          },
        }),
        { status: 200 }
      )
    );

    await waitFor(() => expect(screen.queryByText("Classifying product...")).not.toBeInTheDocument());
    expect(screen.getAllByText("67.63 fl_oz").length).toBeGreaterThanOrEqual(2);

    // Submit form and verify product + variant measurements are sent
    fireEvent.click(screen.getByRole("button", { name: /Confirm & Add/i }));
    await waitFor(() => expect(purchaseBody).not.toBeNull());
    expect(purchaseBody).toMatchObject({
      variant_name: "Pepsi Cola",
      variant_volume_value: 67.63,
      variant_volume_unit: "fl_oz",
      new_product: {
        name: "Soda, Cola",
        volume_value: 67.63,
        volume_unit: "fl_oz",
      },
    });
  });

  it("auto-starts camera by default on mobile devices and keeps it hidden by default on desktop", () => {
    const qc = new QueryClient();

    // Mobile viewport -> camera enabled by default
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query.includes("max-width: 767px"),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));

    const { unmount } = render(
      <QueryClientProvider client={qc}>
        <ScannerDrawer
          open={true}
          initialMode="purchase"
          onClose={() => {}}
          categories={[]}
          locations={[]}
        />
      </QueryClientProvider>
    );
    expect(screen.getByRole("button", { name: "Stop camera" })).toBeInTheDocument();
    unmount();

    // Desktop viewport -> camera hidden by default
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));

    render(
      <QueryClientProvider client={qc}>
        <ScannerDrawer
          open={true}
          initialMode="purchase"
          onClose={() => {}}
          categories={[]}
          locations={[]}
        />
      </QueryClientProvider>
    );
    expect(screen.getByRole("button", { name: "Start camera" })).toBeInTheDocument();
  });

  it("pre-fills Purchase Due Date from calculated_due_days when scanning a known barcode", async () => {
    vi.stubGlobal("matchMedia", () => ({
      matches: false,
      media: "",
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url === "/api/scan/resolve") {
          return new Response(
            JSON.stringify({
              kind: "barcode",
              variant_id: 10,
              variant_name: "11 oz Bag",
              barcode: { id: 1, variant_id: 10, barcode: "028400156363", default_quantity: 1 },
              product: {
                id: 3,
                name: "Tortilla Chips, Nacho Cheese",
                default_location_id: 1,
                label_print_mode: "none",
                use_average_for_due_date: true,
                default_due_days: null,
                calculated_due_days: 34,
              },
            }),
            { status: 200 }
          );
        }
        return new Response("{}", { status: 200 });
      })
    );

    const expected = new Date();
    expected.setDate(expected.getDate() + 34);
    const wantDate = `${expected.getFullYear()}-${String(expected.getMonth() + 1).padStart(2, "0")}-${String(expected.getDate()).padStart(2, "0")}`;

    const qc = new QueryClient();
    render(
      <QueryClientProvider client={qc}>
        <ScannerDrawer
          open={true}
          initialMode="purchase"
          onClose={() => {}}
          categories={[]}
          locations={[{ id: 1, name: "Pantry", parent_id: null, is_freezer: false, hierarchy_name: "Pantry" }]}
        />
      </QueryClientProvider>
    );

    const mainInput = screen.getByLabelText("Barcode or search input");
    fireEvent.change(mainInput, { target: { value: "028400156363" } });
    fireEvent.submit(mainInput.closest("form")!);

    await waitFor(() =>
      expect(screen.getByText("Confirm & Add: Tortilla Chips, Nacho Cheese")).toBeInTheDocument()
    );
    const dueInput = screen.getByLabelText("Due Date") as HTMLInputElement;
    expect(dueInput.value).toBe(wantDate);
  });
});

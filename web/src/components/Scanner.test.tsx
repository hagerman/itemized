import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const { prepareZXingModuleMock, readBarcodesMock } = vi.hoisted(() => ({
  prepareZXingModuleMock: vi.fn(),
  readBarcodesMock: vi.fn(),
}));

vi.mock("zxing-wasm/reader", () => ({
  prepareZXingModule: prepareZXingModuleMock,
  readBarcodes: readBarcodesMock,
}));

vi.mock("zxing-wasm/reader/zxing_reader.wasm?url", () => ({
  default: "/assets/zxing_reader-test.wasm",
}));

import { BarcodeScanner } from "./BarcodeScanner";
import { ScannerDrawer } from "./ScannerDrawer";

describe("BarcodeScanner and ScannerDrawer", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    prepareZXingModuleMock.mockReset();
    prepareZXingModuleMock.mockResolvedValue({});
    readBarcodesMock.mockReset();
    readBarcodesMock.mockResolvedValue([]);
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

  it("shows HTTPS reverse-proxy guidance when camera API is unavailable in an insecure context", async () => {
    const origSecure = Object.getOwnPropertyDescriptor(window, "isSecureContext");
    const origMediaDevices = Object.getOwnPropertyDescriptor(navigator, "mediaDevices");
    Object.defineProperty(window, "isSecureContext", { value: false, configurable: true });
    Object.defineProperty(navigator, "mediaDevices", { value: undefined, configurable: true });

    try {
      render(<BarcodeScanner onScan={vi.fn()} defaultCameraEnabled={true} />);
      await waitFor(() =>
        expect(
          screen.getByText(
            "Camera requires HTTPS. Access Itemized over HTTPS (e.g., via a reverse proxy) to use live barcode scanning."
          )
        ).toBeInTheDocument()
      );
    } finally {
      if (origSecure) Object.defineProperty(window, "isSecureContext", origSecure);
      if (origMediaDevices) Object.defineProperty(navigator, "mediaDevices", origMediaDevices);
    }
  });

  it("shows browser-unavailable error when camera API is unavailable in a secure context", async () => {
    const origSecure = Object.getOwnPropertyDescriptor(window, "isSecureContext");
    const origMediaDevices = Object.getOwnPropertyDescriptor(navigator, "mediaDevices");
    Object.defineProperty(window, "isSecureContext", { value: true, configurable: true });
    Object.defineProperty(navigator, "mediaDevices", { value: undefined, configurable: true });

    try {
      render(<BarcodeScanner onScan={vi.fn()} defaultCameraEnabled={true} />);
      await waitFor(() =>
        expect(screen.getByText("Camera API unavailable in this browser.")).toBeInTheDocument()
      );
    } finally {
      if (origSecure) Object.defineProperty(window, "isSecureContext", origSecure);
      if (origMediaDevices) Object.defineProperty(navigator, "mediaDevices", origMediaDevices);
    }
  });

  it("requests rear camera by default, enumerates devices after permission, and cycles cameras", async () => {
    const origSecure = Object.getOwnPropertyDescriptor(window, "isSecureContext");
    const origMediaDevices = Object.getOwnPropertyDescriptor(navigator, "mediaDevices");
    const callOrder: string[] = [];

    const makeStream = (deviceId: string) =>
      ({
        getVideoTracks: () => [
          {
            getSettings: () => ({ deviceId }),
            getCapabilities: () => ({}),
            stop: vi.fn(),
          },
        ],
        getTracks: () => [{ stop: vi.fn() }],
      }) as unknown as MediaStream;

    const getUserMedia = vi.fn(async (constraints: MediaStreamConstraints) => {
      callOrder.push("getUserMedia");
      const video = constraints.video as MediaTrackConstraints;
      const requestedId =
        typeof video.deviceId === "object" && video.deviceId && "exact" in video.deviceId
          ? String(video.deviceId.exact)
          : "cam-rear";
      return makeStream(requestedId);
    });

    const enumerateDevices = vi.fn(async () => {
      callOrder.push("enumerateDevices");
      return [
        { kind: "videoinput", deviceId: "cam-front", label: "Front Camera" },
        { kind: "videoinput", deviceId: "cam-rear", label: "Back Camera" },
      ] as MediaDeviceInfo[];
    });

    Object.defineProperty(window, "isSecureContext", { value: true, configurable: true });
    Object.defineProperty(navigator, "mediaDevices", {
      value: { getUserMedia, enumerateDevices },
      configurable: true,
    });
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);

    try {
      render(<BarcodeScanner onScan={vi.fn()} defaultCameraEnabled={true} />);

      await waitFor(() => expect(screen.getByRole("button", { name: "Switch camera" })).toBeInTheDocument());
      expect(getUserMedia).toHaveBeenCalledWith({
        video: {
          facingMode: "environment",
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });
      expect(callOrder.slice(0, 2)).toEqual(["getUserMedia", "enumerateDevices"]);

      fireEvent.click(screen.getByRole("button", { name: "Switch camera" }));
      await waitFor(() =>
        expect(getUserMedia).toHaveBeenLastCalledWith({
          video: {
            deviceId: { exact: "cam-front" },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        })
      );
    } finally {
      if (origSecure) Object.defineProperty(window, "isSecureContext", origSecure);
      if (origMediaDevices) Object.defineProperty(navigator, "mediaDevices", origMediaDevices);
    }
  });

  it("decodes UPC and QR codes via self-hosted zxing-wasm on already-playing video without BarcodeDetector and recovers from transient errors", async () => {
    const origSecure = Object.getOwnPropertyDescriptor(window, "isSecureContext");
    const origMediaDevices = Object.getOwnPropertyDescriptor(navigator, "mediaDevices");
    const origBarcodeDetector = Object.getOwnPropertyDescriptor(window, "BarcodeDetector");

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
    Object.defineProperty(window, "BarcodeDetector", { value: undefined, configurable: true });
    Object.defineProperty(navigator, "mediaDevices", {
      value: {
        getUserMedia: vi.fn().mockResolvedValue(stream),
        enumerateDevices: vi.fn().mockResolvedValue([]),
      },
      configurable: true,
    });
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);

    const drawImage = vi.fn();
    const getImageData = vi.fn((_x: number, _y: number, width: number, height: number) => ({
      data: new Uint8ClampedArray(width * height * 4),
      width,
      height,
    }));
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      drawImage,
      getImageData,
    } as unknown as CanvasRenderingContext2D);

    let attempt = 0;
    readBarcodesMock.mockImplementation(async () => {
      attempt += 1;
      if (attempt === 1) {
        throw new Error("transient frame error");
      }
      if (attempt === 2) {
        return [{ text: "049000028904" }];
      }
      return [{ text: "https://itemized.example.com/go/i/42" }];
    });

    const onScan = vi.fn();

    try {
      const { container } = render(<BarcodeScanner onScan={onScan} defaultCameraEnabled={true} />);
      const video = container.querySelector("video")!;
      Object.defineProperty(video, "readyState", { value: 4, configurable: true });
      Object.defineProperty(video, "videoWidth", { value: 1280, configurable: true });
      Object.defineProperty(video, "videoHeight", { value: 720, configurable: true });

      await waitFor(() => expect(onScan).toHaveBeenCalledWith("049000028904"), { timeout: 2000 });
      await waitFor(
        () => expect(onScan).toHaveBeenCalledWith("https://itemized.example.com/go/i/42"),
        { timeout: 2000 }
      );
      expect(prepareZXingModuleMock).toHaveBeenCalledWith(
        expect.objectContaining({
          fireImmediately: true,
          overrides: expect.objectContaining({ locateFile: expect.any(Function) }),
        })
      );
      const locateFile = prepareZXingModuleMock.mock.calls[0][0].overrides.locateFile as () => string;
      expect(locateFile()).toBe("/assets/zxing_reader-test.wasm");
      // 1280x720 scaled down to max 1024px long edge -> 1024x576
      expect(drawImage).toHaveBeenCalledWith(video, 0, 0, 1024, 576);
      expect(readBarcodesMock.mock.calls.length).toBeGreaterThanOrEqual(3);
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

  it("surfaces decoder initialization failures in the camera error banner", async () => {
    const origSecure = Object.getOwnPropertyDescriptor(window, "isSecureContext");
    const origMediaDevices = Object.getOwnPropertyDescriptor(navigator, "mediaDevices");
    const origBarcodeDetector = Object.getOwnPropertyDescriptor(window, "BarcodeDetector");

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
    Object.defineProperty(window, "BarcodeDetector", { value: undefined, configurable: true });
    Object.defineProperty(navigator, "mediaDevices", {
      value: {
        getUserMedia: vi.fn().mockResolvedValue(stream),
        enumerateDevices: vi.fn().mockResolvedValue([]),
      },
      configurable: true,
    });
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    prepareZXingModuleMock.mockRejectedValueOnce(new Error("failed to fetch wasm"));

    try {
      render(<BarcodeScanner onScan={vi.fn()} defaultCameraEnabled={true} />);
      await waitFor(() =>
        expect(
          screen.getByText("Barcode decoder failed to initialize: failed to fetch wasm")
        ).toBeInTheDocument()
      );
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

  it("closes ScannerDrawer when clicking the backdrop but stays open on inside clicks", () => {
    const onClose = vi.fn();
    const qc = new QueryClient();
    render(
      <QueryClientProvider client={qc}>
        <ScannerDrawer
          open={true}
          initialMode="purchase"
          onClose={onClose}
          categories={[]}
          locations={[]}
        />
      </QueryClientProvider>
    );

    const dialog = screen.getByRole("dialog", { name: "Scanner" });
    const heading = screen.getByText("Scan & Action");

    fireEvent.mouseDown(heading);
    fireEvent.click(heading);
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.mouseDown(dialog);
    fireEvent.click(dialog);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("constrains Purchase form grid cells and Due Date input to prevent iOS column overlap", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url === "/api/scan/resolve") {
        return new Response(JSON.stringify({ kind: "unknown", barcode: "7272" }), { status: 200 });
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
          categories={[{ id: 1, name: "Drinks", parent_id: null, hierarchy_name: "Drinks" }]}
          locations={[{ id: 1, name: "Refrigerator", parent_id: null, is_freezer: false, hierarchy_name: "Refrigerator" }]}
        />
      </QueryClientProvider>
    );

    const mainInput = screen.getByLabelText("Barcode or search input");
    fireEvent.change(mainInput, { target: { value: "7272" } });
    fireEvent.submit(mainInput.closest("form")!);

    const dueDateInput = await screen.findByLabelText("Due Date");
    const qtyInput = screen.getByLabelText("Quantity");
    const labelModeSelect = screen.getByLabelText("Label Mode");
    const locationBtn = screen.getByRole("button", { name: "Purchase location" });

    // Verify Due Date input is constrained against iOS WebKit intrinsic-width overflow
    expect(dueDateInput).toHaveClass("block", "h-10", "w-full", "min-w-0", "max-w-full", "appearance-none");
    expect(qtyInput).toHaveClass("h-10", "w-full", "min-w-0", "max-w-full");
    expect(labelModeSelect).toHaveClass("h-10", "w-full", "min-w-0", "max-w-full");
    expect(locationBtn).toHaveClass("h-10", "w-full", "min-w-0");

    // Verify all four grid cells include min-w-0 so CSS Grid tracks cannot overflow
    const grid = dueDateInput.closest(".grid");
    expect(grid).not.toBeNull();
    expect(grid!.children.length).toBe(4);
    for (const cell of Array.from(grid!.children)) {
      expect(cell).toHaveClass("min-w-0");
    }
  });
});

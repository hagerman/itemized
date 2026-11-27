import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
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
import { SCAN_MODE_STORAGE_KEY, ScannerDrawer } from "./ScannerDrawer";

describe("BarcodeScanner and ScannerDrawer", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
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
    expect(screen.getByRole("button", { name: "New product category" })).toHaveTextContent("Beverages");
    expect(screen.getByRole("button", { name: "Purchase location" })).toHaveTextContent("Select location");
    expect(screen.getByRole("button", { name: /Confirm & Add/i })).toBeDisabled();

    // Select a location before submitting
    fireEvent.click(screen.getByRole("button", { name: "Purchase location" }));
    fireEvent.click(screen.getByRole("button", { name: "Fridge" }));
    expect(screen.getByRole("button", { name: /Confirm & Add/i })).not.toBeDisabled();

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
            "Camera requires HTTPS. Access itemized over HTTPS (e.g., via a reverse proxy) to use live barcode scanning."
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
      if (url === "/api/auth/status") {
        return new Response(
          JSON.stringify({ initialized: true, oidc_enabled: false, oidc_force: false, printers_enabled: true, user: { id: 1, email: "a@b.c", role: "admin" } }),
          { status: 200 }
        );
      }
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
    const labelModeSelect = await screen.findByLabelText("Label Mode");
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

  it("omits Purchase Label Mode when no printers are configured while preserving label_print_mode on submit", async () => {
    const purchasePayloads: Array<Record<string, unknown>> = [];
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api/auth/status") {
        return new Response(
          JSON.stringify({ initialized: true, oidc_enabled: false, oidc_force: false, printers_enabled: false, user: { id: 1, email: "a@b.c", role: "member" } }),
          { status: 200 }
        );
      }
      if (url === "/api/scan/resolve") {
        return new Response(
          JSON.stringify({
            kind: "product",
            product: {
              id: 7,
              name: "Milk, Whole",
              category_id: 1,
              category_name: "Drinks",
              default_location_id: 1,
              default_location_name: "Refrigerator",
              default_due_days: 7,
              default_due_days_on_open: null,
              default_due_days_on_freeze: null,
              default_due_days_on_thaw: null,
              use_average_for_due_date: false,
              label_print_mode: "single",
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
              on_shopping_list: false,
              low_stock: false,
              low_stock_amount: null,
              due_soon: false,
              overdue: false,
            },
            items: [],
          }),
          { status: 200 }
        );
      }
      if (url === "/api/workflows/purchase" && init?.method === "POST") {
        purchasePayloads.push(JSON.parse(String(init.body)));
        return new Response(JSON.stringify({ items: [{ id: 99 }], print_warnings: [] }), { status: 201 });
      }
      return new Response(JSON.stringify({ products: [] }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
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
    fireEvent.change(mainInput, { target: { value: "https://itemized.local/go/p/7" } });
    fireEvent.submit(mainInput.closest("form")!);

    const dueDateInput = await screen.findByLabelText("Due Date");
    expect(screen.queryByLabelText("Label Mode")).not.toBeInTheDocument();

    const grid = dueDateInput.closest(".grid");
    expect(grid).not.toBeNull();
    expect(grid!.children.length).toBe(3);
    expect(grid).toHaveClass("sm:grid-cols-3");

    fireEvent.click(screen.getByRole("button", { name: /Confirm & Add/i }));
    await waitFor(() => expect(purchasePayloads).toHaveLength(1));
    expect(purchasePayloads[0].label_print_mode).toBe("single");
  });

  it("resets transient workflow state when closed and reopened while retaining the selected mode", async () => {
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
    const categories = [{ id: 1, name: "Dairy", parent_id: null, hierarchy_name: "Dairy" }];
    const locations = [{ id: 1, name: "Fridge", parent_id: null, is_freezer: false, hierarchy_name: "Fridge" }];

    const { rerender } = render(
      <QueryClientProvider client={qc}>
        <ScannerDrawer open={true} onClose={() => {}} categories={categories} locations={locations} />
      </QueryClientProvider>
    );

    // Enter Purchase state: scan unknown barcode and type a product name
    const mainInput = screen.getByLabelText("Barcode or search input");
    fireEvent.change(mainInput, { target: { value: "049000028904" } });
    fireEvent.submit(mainInput.closest("form")!);

    const nameInput = (await screen.findByPlaceholderText("Product name")) as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: "Oat Milk" } });
    expect(nameInput.value).toBe("Oat Milk");

    // Close and reopen in Purchase mode -> Purchase form and UPC banner are completely cleared
    rerender(
      <QueryClientProvider client={qc}>
        <ScannerDrawer open={false} onClose={() => {}} categories={categories} locations={locations} />
      </QueryClientProvider>
    );
    rerender(
      <QueryClientProvider client={qc}>
        <ScannerDrawer open={true} onClose={() => {}} categories={categories} locations={locations} />
      </QueryClientProvider>
    );

    expect(screen.queryByPlaceholderText("Product name")).not.toBeInTheDocument();
    expect(screen.queryByText(/Barcode not found in OpenFoodFacts/)).not.toBeInTheDocument();

    // Switch to Transfer, pick a destination, close, and reopen -> mode stays Transfer, destination resets
    fireEvent.click(screen.getByRole("button", { name: "Transfer" }));
    fireEvent.click(screen.getByRole("button", { name: "Destination location" }));
    fireEvent.click(screen.getByRole("button", { name: "Fridge" }));
    expect(screen.getByRole("button", { name: "Destination location" })).toHaveTextContent("Fridge");

    rerender(
      <QueryClientProvider client={qc}>
        <ScannerDrawer open={false} onClose={() => {}} categories={categories} locations={locations} />
      </QueryClientProvider>
    );
    rerender(
      <QueryClientProvider client={qc}>
        <ScannerDrawer open={true} onClose={() => {}} categories={categories} locations={locations} />
      </QueryClientProvider>
    );

    // Still in Transfer mode, but destination is reset to empty placeholder
    expect(screen.getByRole("button", { name: "Transfer" }).className).toContain("bg-indigo-600");
    expect(screen.getByRole("button", { name: "Destination location" })).toHaveTextContent("-- Choose destination --");
  });

  it("discards in-flight UPC lookup responses when closed before completion and reopened", async () => {
    let resolveUpc!: (resp: Response) => void;
    const fetchMock = vi.fn(async (url: string) => {
      if (url === "/api/scan/resolve") {
        return new Response(JSON.stringify({ kind: "unknown", barcode: "012000001291" }), { status: 200 });
      }
      if (url === "/api/upc/lookup") {
        return new Promise<Response>((resolve) => {
          resolveUpc = resolve;
        });
      }
      return new Response(JSON.stringify({ products: [] }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const qc = new QueryClient();
    const { rerender } = render(
      <QueryClientProvider client={qc}>
        <ScannerDrawer open={true} onClose={() => {}} categories={[]} locations={[]} />
      </QueryClientProvider>
    );

    const mainInput = screen.getByLabelText("Barcode or search input");
    fireEvent.change(mainInput, { target: { value: "012000001291" } });
    fireEvent.submit(mainInput.closest("form")!);

    await waitFor(() =>
      expect(screen.getByText("Looking up barcode in OpenFoodFacts...")).toBeInTheDocument()
    );

    // Close modal before lookup resolves, then reopen
    rerender(
      <QueryClientProvider client={qc}>
        <ScannerDrawer open={false} onClose={() => {}} categories={[]} locations={[]} />
      </QueryClientProvider>
    );
    rerender(
      <QueryClientProvider client={qc}>
        <ScannerDrawer open={true} onClose={() => {}} categories={[]} locations={[]} />
      </QueryClientProvider>
    );

    // Resolve the stale lookup from the closed session
    resolveUpc(
      new Response(
        JSON.stringify({ found: true, result: { title: "Stale Soda", measurement: "12 fl oz" } }),
        { status: 200 }
      )
    );
    await new Promise((r) => setTimeout(r, 20));

    expect(screen.queryByText(/Stale Soda/)).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Product name")).not.toBeInTheDocument();
  });

  it("persists chosen scan mode in localStorage across remounts and falls back to Purchase on invalid or unavailable storage", () => {
    const qc = new QueryClient();

    // Invalid stored value falls back to Purchase
    window.localStorage.setItem(SCAN_MODE_STORAGE_KEY, "invalid-mode");
    const { unmount } = render(
      <QueryClientProvider client={qc}>
        <ScannerDrawer open={true} onClose={() => {}} categories={[]} locations={[]} />
      </QueryClientProvider>
    );
    expect(screen.getByRole("button", { name: "Purchase" }).className).toContain("bg-indigo-600");

    // Switch to Consume -> persisted to localStorage
    fireEvent.click(screen.getByRole("button", { name: "Consume" }));
    expect(window.localStorage.getItem(SCAN_MODE_STORAGE_KEY)).toBe("consume");
    unmount();

    // Fresh mount (simulating browser reload) opens directly in Consume
    const remounted = render(
      <QueryClientProvider client={qc}>
        <ScannerDrawer open={true} onClose={() => {}} categories={[]} locations={[]} />
      </QueryClientProvider>
    );
    expect(screen.getByRole("button", { name: "Consume" }).className).toContain("bg-indigo-600");
    remounted.unmount();

    // Storage methods throwing fall back safely to Purchase without crashing on mode switch
    const originalLocalStorage = Object.getOwnPropertyDescriptor(window, "localStorage");
    try {
      Object.defineProperty(window, "localStorage", {
        configurable: true,
        writable: true,
        value: {
          getItem: () => {
            throw new Error("SecurityError");
          },
          setItem: () => {
            throw new Error("QuotaExceededError");
          },
          removeItem: () => {},
          clear: () => {},
          key: () => null,
          length: 0,
        } as Storage,
      });

      const throwingMethodsRender = render(
        <QueryClientProvider client={qc}>
          <ScannerDrawer open={true} onClose={() => {}} categories={[]} locations={[]} />
        </QueryClientProvider>
      );
      expect(screen.getByRole("button", { name: "Purchase" }).className).toContain("bg-indigo-600");
      fireEvent.click(screen.getByRole("button", { name: "Open" }));
      expect(screen.getByRole("button", { name: "Open" }).className).toContain("bg-indigo-600");
      throwingMethodsRender.unmount();

      // Accessing window.localStorage itself throwing (e.g. restricted private browsing) also falls back safely
      Object.defineProperty(window, "localStorage", {
        configurable: true,
        get() {
          throw new Error("SecurityError");
        },
      });

      render(
        <QueryClientProvider client={qc}>
          <ScannerDrawer open={true} onClose={() => {}} categories={[]} locations={[]} />
        </QueryClientProvider>
      );
      expect(screen.getByRole("button", { name: "Purchase" }).className).toContain("bg-indigo-600");
      fireEvent.click(screen.getByRole("button", { name: "Open" }));
      expect(screen.getByRole("button", { name: "Open" }).className).toContain("bg-indigo-600");
    } finally {
      if (originalLocalStorage) {
        Object.defineProperty(window, "localStorage", originalLocalStorage);
      }
    }
  });

  it("keeps idle Purchase mode compact like Consume and Open while allowing Transfer and Inventory controls", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url === "/api/scan/resolve") {
        return new Response(JSON.stringify({ kind: "unknown", barcode: "milk" }), { status: 200 });
      }
      if (url.startsWith("/api/products")) {
        return new Response(
          JSON.stringify({
            products: [
              {
                id: 1,
                name: "Milk, Whole",
                category_id: 1,
                category_name: "Dairy",
                default_location_id: 1,
                label_print_mode: "per_item",
                use_average_for_due_date: true,
              },
            ],
          }),
          { status: 200 }
        );
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

    const body = screen.getByTestId("scanner-body");

    // Idle Purchase renders only BarcodeScanner (no empty sibling wrapper adding space-y-4 margin)
    expect(body.children.length).toBe(1);

    // Idle Consume and Open match idle Purchase's compact single-child body
    fireEvent.click(screen.getByRole("button", { name: "Consume" }));
    expect(body.children.length).toBe(1);

    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    expect(body.children.length).toBe(1);

    // Transfer and Inventory render their default location picker controls
    fireEvent.click(screen.getByRole("button", { name: "Transfer" }));
    expect(body.children.length).toBe(2);
    expect(screen.getByText(/Destination Location/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Inventory" }));
    expect(body.children.length).toBe(2);
    expect(screen.getByText(/Location to Audit/i)).toBeInTheDocument();

    // Switching back to Purchase stays compact until Purchase content becomes active
    fireEvent.click(screen.getByRole("button", { name: "Purchase" }));
    expect(body.children.length).toBe(1);

    const input = screen.getByLabelText("Barcode or search input");
    fireEvent.change(input, { target: { value: "milk" } });
    fireEvent.submit(input.closest("form")!);

    await waitFor(() => expect(screen.getByText("Matching Products")).toBeInTheDocument());
    expect(body.children.length).toBe(2);
  });

  it("triggers a brief visual flash alongside the beep on Consume scans and clears automatically", async () => {
    vi.useFakeTimers();
    try {
      const onScan = vi.fn();
      const { rerender } = render(
        <BarcodeScanner onScan={onScan} defaultCameraEnabled={true} flashOnScan={false} />
      );

      const input = screen.getByLabelText("Barcode or search input");
      fireEvent.change(input, { target: { value: "https://itemized.local/go/i/1" } });
      fireEvent.submit(input.closest("form")!);
      expect(screen.getByTestId("scanner-bar")).toHaveAttribute("data-scan-flash", "false");
      expect(screen.queryByTestId("scan-flash-overlay")).not.toBeInTheDocument();

      rerender(<BarcodeScanner onScan={onScan} defaultCameraEnabled={true} flashOnScan={true} />);
      fireEvent.change(input, { target: { value: "https://itemized.local/go/i/2" } });
      fireEvent.submit(input.closest("form")!);

      expect(screen.getByTestId("scanner-bar")).toHaveAttribute("data-scan-flash", "true");
      expect(screen.getByTestId("scan-flash-overlay")).toBeInTheDocument();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(300);
      });

      expect(screen.getByTestId("scanner-bar")).toHaveAttribute("data-scan-flash", "false");
      expect(screen.queryByTestId("scan-flash-overlay")).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("shows an already-consumed message with item name and skips consume API when rescanning a consumed item", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url === "/api/scan/resolve") {
        return new Response(
          JSON.stringify({
            kind: "item",
            item: {
              id: 22,
              product_id: 1,
              product_name: "Milk, Whole",
              consumed_on_date: "2026-11-20",
            },
            product: { id: 1, name: "Milk, Whole" },
          }),
          { status: 200 }
        );
      }
      return new Response("{}", { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const qc = new QueryClient();
    render(
      <QueryClientProvider client={qc}>
        <ScannerDrawer
          open={true}
          initialMode="consume"
          onClose={() => {}}
          categories={[]}
          locations={[]}
        />
      </QueryClientProvider>
    );

    const input = screen.getByLabelText("Barcode or search input");
    fireEvent.change(input, { target: { value: "https://itemized.local/go/i/22" } });
    fireEvent.submit(input.closest("form")!);

    await waitFor(() =>
      expect(screen.getByText(/Milk, Whole was already consumed/i)).toBeInTheDocument()
    );
    expect(screen.queryByRole("button", { name: /Undo/i })).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalledWith(
      "/api/items/22/consume",
      expect.anything()
    );
  });

  it("stages items, product selections, and variant-filtered UPC selections in Transfer mode and completes via location QR or picker", async () => {
    const bulkCalls: Array<Record<string, unknown>> = [];
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api/scan/resolve") {
        const body = JSON.parse(String(init?.body || "{}"));
        const inp = String(body.input || "");
        if (inp === "https://itemized.local/go/l/2") {
          return new Response(
            JSON.stringify({
              kind: "location",
              location: { id: 2, name: "Freezer", parent_id: null, is_freezer: true, hierarchy_name: "Freezer" },
              items: [],
            }),
            { status: 200 }
          );
        }
        if (inp === "https://itemized.local/go/i/101") {
          return new Response(
            JSON.stringify({
              kind: "item",
              item: {
                id: 101,
                product_id: 10,
                product_name: "Chicken Breast",
                variant_id: null,
                variant_name: "",
                location_id: 1,
                location_name: "Fridge",
                due_on_date: "2026-11-28",
                consumed_on_date: null,
              },
              product: { id: 10, name: "Chicken Breast" },
            }),
            { status: 200 }
          );
        }
        if (inp === "https://itemized.local/go/i/199") {
          return new Response(
            JSON.stringify({
              kind: "item",
              item: {
                id: 199,
                product_id: 10,
                product_name: "Old Soup",
                variant_id: null,
                variant_name: "",
                location_id: 1,
                location_name: "Fridge",
                due_on_date: null,
                consumed_on_date: "2026-11-10",
              },
              product: { id: 10, name: "Old Soup" },
            }),
            { status: 200 }
          );
        }
        if (inp === "https://itemized.local/go/p/20") {
          return new Response(
            JSON.stringify({
              kind: "product",
              product: { id: 20, name: "Pasta Sauce" },
              items: [
                {
                  id: 201,
                  product_id: 20,
                  product_name: "Pasta Sauce",
                  variant_id: 30,
                  variant_name: "Marinara 24oz",
                  location_id: 1,
                  location_name: "Pantry",
                  due_on_date: "2026-12-01",
                  consumed_on_date: null,
                },
                {
                  id: 202,
                  product_id: 20,
                  product_name: "Pasta Sauce",
                  variant_id: 31,
                  variant_name: "Alfredo 15oz",
                  location_id: 1,
                  location_name: "Pantry",
                  due_on_date: "2026-12-15",
                  consumed_on_date: null,
                },
              ],
            }),
            { status: 200 }
          );
        }
        if (inp === "012345678905") {
          return new Response(
            JSON.stringify({
              kind: "barcode",
              barcode: { id: 1, variant_id: 40, barcode: "012345678905", default_quantity: 1 },
              variant_id: 40,
              variant_name: "12 oz Can",
              product: { id: 30, name: "Soda" },
              items: [
                {
                  id: 301,
                  product_id: 30,
                  product_name: "Soda",
                  variant_id: 40,
                  variant_name: "12 oz Can",
                  location_id: 1,
                  location_name: "Pantry",
                  due_on_date: "2027-01-01",
                  consumed_on_date: null,
                },
                {
                  id: 302,
                  product_id: 30,
                  product_name: "Soda",
                  variant_id: 41,
                  variant_name: "2 Liter Bottle",
                  location_id: 1,
                  location_name: "Pantry",
                  due_on_date: "2027-01-05",
                  consumed_on_date: null,
                },
              ],
            }),
            { status: 200 }
          );
        }
      }
      if (url === "/api/items/bulk") {
        bulkCalls.push(JSON.parse(String(init?.body || "{}")));
        return new Response(JSON.stringify({ processed: 2, print_warnings: [] }), { status: 200 });
      }
      return new Response("{}", { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const qc = new QueryClient();
    render(
      <QueryClientProvider client={qc}>
        <ScannerDrawer
          open={true}
          initialMode="transfer"
          onClose={() => {}}
          categories={[]}
          locations={[
            { id: 1, name: "Fridge", parent_id: null, is_freezer: false, hierarchy_name: "Fridge" },
            { id: 2, name: "Freezer", parent_id: null, is_freezer: true, hierarchy_name: "Freezer" },
          ]}
        />
      </QueryClientProvider>
    );

    const input = screen.getByLabelText("Barcode or search input");
    const scan = (val: string) => {
      fireEvent.change(input, { target: { value: val } });
      fireEvent.submit(input.closest("form")!);
    };

    // 1. Scanning location QR with empty list prompts to scan items first
    scan("https://itemized.local/go/l/2");
    await waitFor(() =>
      expect(screen.getByText(/Scan one or more items to transfer first/i)).toBeInTheDocument()
    );
    expect(bulkCalls.length).toBe(0);

    // 2. Scanning an already-consumed item shows notice with product name and does not stage it
    scan("https://itemized.local/go/i/199");
    await waitFor(() =>
      expect(screen.getByText(/Old Soup was already consumed/i)).toBeInTheDocument()
    );
    expect(screen.queryByTestId("transfer-staged-list")).not.toBeInTheDocument();

    // 3. Scanning an in-stock item QR stages it directly
    scan("https://itemized.local/go/i/101");
    await waitFor(() => expect(screen.getByTestId("transfer-staged-list")).toBeInTheDocument());
    expect(screen.getByText("Items to Transfer (1)")).toBeInTheDocument();

    // 4. Scanning a product QR lists all in-stock items of that product for multi-select staging
    scan("https://itemized.local/go/p/20");
    await waitFor(() => expect(screen.getByText("Select items of Pasta Sauce")).toBeInTheDocument());
    expect(screen.getByText("(Marinara 24oz)")).toBeInTheDocument();
    expect(screen.getByText("(Alfredo 15oz)")).toBeInTheDocument();
    // Select the second item too so both are added
    const checkboxes = screen.getAllByRole("checkbox");
    fireEvent.click(checkboxes[1]);
    fireEvent.click(screen.getByRole("button", { name: /Add to Transfer List \(2\)/i }));
    await waitFor(() => expect(screen.getByText("Items to Transfer (3)")).toBeInTheDocument());

    // 5. Remove one staged item (#202)
    fireEvent.click(screen.getByRole("button", { name: "Remove Pasta Sauce #202" }));
    expect(screen.getByText("Items to Transfer (2)")).toBeInTheDocument();

    // 6. Scanning destination location QR completes transfer of remaining staged items (#101, #201)
    scan("https://itemized.local/go/l/2");
    await waitFor(() =>
      expect(screen.getByText(/Transferred 2 item\(s\) to Freezer/i)).toBeInTheDocument()
    );
    expect(bulkCalls[0]).toEqual({
      action: "transfer",
      item_ids: [101, 201],
      location_id: 2,
    });
    expect(screen.getByText("Items to Transfer (0)")).toBeInTheDocument();

    // 7. Scanning a UPC lists ONLY items matching that variant (12 oz Can, not 2 Liter Bottle)
    scan("012345678905");
    await waitFor(() => expect(screen.getByText("Select items of Soda (12 oz Can)")).toBeInTheDocument());
    expect(screen.getByText("(12 oz Can)")).toBeInTheDocument();
    expect(screen.queryByText("(2 Liter Bottle)")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Add to Transfer List \(1\)/i }));
    await waitFor(() => expect(screen.getByText("Items to Transfer (1)")).toBeInTheDocument());

    // 8. Complete transfer by selecting destination in HierarchySelect and clicking Complete Transfer
    fireEvent.click(screen.getByRole("button", { name: "Destination location" }));
    fireEvent.click(screen.getByRole("button", { name: "Freezer" }));
    fireEvent.click(screen.getByRole("button", { name: /Complete Transfer \(1\)/i }));
    await waitFor(() =>
      expect(screen.getByText(/Transferred 1 item\(s\) to Freezer/i)).toBeInTheDocument()
    );
    expect(bulkCalls[1]).toEqual({
      action: "transfer",
      item_ids: [301],
      location_id: 2,
    });
  });

  it("supports product-name search with clickable Matching Products in Consume and Open modes", async () => {
    const bulkCalls: Array<Record<string, unknown>> = [];
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api/scan/resolve") {
        const body = JSON.parse(String(init?.body || "{}"));
        return new Response(JSON.stringify({ kind: "unknown", barcode: body.input }), { status: 200 });
      }
      if (url === "/api/products?status=in_stock&q=Bagel") {
        return new Response(
          JSON.stringify({
            products: [
              { id: 1, name: "Bagel", category_name: "Groceries > Baked Goods" },
              { id: 2, name: "Bagel, Pretzel", category_name: "Groceries > Baked Goods" },
            ],
          }),
          { status: 200 }
        );
      }
      if (url === "/api/products/2") {
        return new Response(
          JSON.stringify({
            product: { id: 2, name: "Bagel, Pretzel" },
            variants: [],
            items: [
              {
                id: 501,
                product_id: 2,
                product_name: "Bagel, Pretzel",
                location_name: "Pantry",
                due_on_date: "2026-12-01",
                consumed_on_date: null,
              },
            ],
          }),
          { status: 200 }
        );
      }
      if (url === "/api/products?status=in_stock&q=Milk") {
        return new Response(
          JSON.stringify({
            products: [{ id: 3, name: "Milk, Whole", category_name: "Groceries > Dairy" }],
          }),
          { status: 200 }
        );
      }
      if (url === "/api/products/3") {
        return new Response(
          JSON.stringify({
            product: { id: 3, name: "Milk, Whole" },
            variants: [],
            items: [
              {
                id: 601,
                product_id: 3,
                product_name: "Milk, Whole",
                location_name: "Fridge",
                due_on_date: "2026-12-05",
                consumed_on_date: null,
              },
            ],
          }),
          { status: 200 }
        );
      }
      if (url === "/api/products?status=in_stock&q=NothingHere") {
        return new Response(JSON.stringify({ products: [] }), { status: 200 });
      }
      if (url === "/api/items/bulk") {
        bulkCalls.push(JSON.parse(String(init?.body || "{}")));
        return new Response(JSON.stringify({ processed: 1 }), { status: 200 });
      }
      return new Response("{}", { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const qc = new QueryClient();
    render(
      <QueryClientProvider client={qc}>
        <ScannerDrawer
          open={true}
          initialMode="consume"
          onClose={() => {}}
          categories={[]}
          locations={[]}
        />
      </QueryClientProvider>
    );

    const input = screen.getByLabelText("Barcode or search input");
    const search = (val: string) => {
      fireEvent.change(input, { target: { value: val } });
      fireEvent.submit(input.closest("form")!);
    };

    // Multi-match in Consume shows clickable Matching Products list
    search("Bagel");
    await waitFor(() => expect(screen.getByText("Matching Products")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /Bagel\s+Groceries > Baked Goods/i })).toBeInTheDocument();
    const pretzelBtn = screen.getByRole("button", { name: /Bagel, Pretzel/i });
    fireEvent.click(pretzelBtn);

    // Selecting a product clears Matching Products and loads its in-stock items
    await waitFor(() => expect(screen.getByText("Select items of Bagel, Pretzel")).toBeInTheDocument());
    expect(screen.queryByText("Matching Products")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Apply consume \(1\)/i }));
    await waitFor(() => expect(screen.getByText("Updated 1 item(s).")).toBeInTheDocument());
    expect(bulkCalls[0]).toEqual({ action: "consume", item_ids: [501], location_id: undefined });

    // Switch to Open mode: single match auto-loads items directly
    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    search("Milk");
    await waitFor(() => expect(screen.getByText("Select items of Milk, Whole")).toBeInTheDocument());
    expect(screen.queryByText("Matching Products")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Apply open \(1\)/i })).toBeInTheDocument();

    // Zero matches displays status message without product creation form
    search("NothingHere");
    await waitFor(() =>
      expect(screen.getByText('No in-stock products matching "NothingHere".')).toBeInTheDocument()
    );
    expect(screen.queryByText(/Create Product/i)).not.toBeInTheDocument();
  });

  it("supports product-name search in Transfer mode while keeping numeric unknown barcode errors", async () => {
    const productSearchUrls: string[] = [];
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api/scan/resolve") {
        const body = JSON.parse(String(init?.body || "{}"));
        return new Response(JSON.stringify({ kind: "unknown", barcode: body.input }), { status: 200 });
      }
      if (url.startsWith("/api/products?")) {
        productSearchUrls.push(url);
      }
      if (url === "/api/products?status=in_stock&q=Bagel") {
        return new Response(
          JSON.stringify({
            products: [
              { id: 1, name: "Bagel", category_name: "Groceries > Baked Goods" },
              { id: 2, name: "Bagel, Pretzel", category_name: "Groceries > Baked Goods" },
            ],
          }),
          { status: 200 }
        );
      }
      if (url === "/api/products/1") {
        return new Response(
          JSON.stringify({
            product: { id: 1, name: "Bagel" },
            variants: [],
            items: [
              {
                id: 701,
                product_id: 1,
                product_name: "Bagel",
                location_name: "Pantry",
                due_on_date: "2026-12-02",
                consumed_on_date: null,
              },
            ],
          }),
          { status: 200 }
        );
      }
      if (url === "/api/products?status=in_stock&q=Butter") {
        return new Response(
          JSON.stringify({
            products: [{ id: 4, name: "Butter, Salted", category_name: "Groceries > Dairy" }],
          }),
          { status: 200 }
        );
      }
      if (url === "/api/products/4") {
        return new Response(
          JSON.stringify({
            product: { id: 4, name: "Butter, Salted" },
            variants: [],
            items: [
              {
                id: 801,
                product_id: 4,
                product_name: "Butter, Salted",
                location_name: "Fridge",
                due_on_date: "2026-12-10",
                consumed_on_date: null,
              },
            ],
          }),
          { status: 200 }
        );
      }
      if (url === "/api/products?status=in_stock&q=NoMatch") {
        return new Response(JSON.stringify({ products: [] }), { status: 200 });
      }
      return new Response("{}", { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const qc = new QueryClient();
    render(
      <QueryClientProvider client={qc}>
        <ScannerDrawer
          open={true}
          initialMode="transfer"
          onClose={() => {}}
          categories={[]}
          locations={[
            { id: 1, name: "Pantry", parent_id: null, is_freezer: false, hierarchy_name: "Pantry" },
            { id: 2, name: "Freezer", parent_id: null, is_freezer: true, hierarchy_name: "Freezer" },
          ]}
        />
      </QueryClientProvider>
    );

    const input = screen.getByLabelText("Barcode or search input");
    const search = (val: string) => {
      fireEvent.change(input, { target: { value: val } });
      fireEvent.submit(input.closest("form")!);
    };

    // Multi-match search in Transfer shows clickable Matching Products list and stages chosen item
    search("Bagel");
    await waitFor(() => expect(screen.getByText("Matching Products")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /^Bagel\s+Groceries > Baked Goods$/i }));
    await waitFor(() => expect(screen.getByText("Select items of Bagel")).toBeInTheDocument());
    expect(screen.queryByText("Matching Products")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Add to Transfer List \(1\)/i }));
    await waitFor(() => expect(screen.getByText("Items to Transfer (1)")).toBeInTheDocument());

    // Single-match search in Transfer directly loads items for staging
    search("Butter");
    await waitFor(() => expect(screen.getByText("Select items of Butter, Salted")).toBeInTheDocument());
    expect(screen.queryByText("Matching Products")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Add to Transfer List \(1\)/i }));
    await waitFor(() => expect(screen.getByText("Items to Transfer (2)")).toBeInTheDocument());

    // Zero-match search shows status message
    search("NoMatch");
    await waitFor(() =>
      expect(screen.getByText('No in-stock products matching "NoMatch".')).toBeInTheDocument()
    );

    // Numeric unknown barcode keeps unrecognized barcode error without product text search
    const searchCountBeforeBarcode = productSearchUrls.length;
    search("999999999999");
    await waitFor(() => expect(screen.getByText("Unrecognized barcode or QR code.")).toBeInTheDocument());
    expect(productSearchUrls.length).toBe(searchCountBeforeBarcode);
  });

  it("uses matched product directly in Purchase mode without lookup/classification and cancels in-flight unknown lookup", async () => {
    let resolveUpc!: (resp: Response) => void;
    let resolveClassify!: (resp: Response) => void;
    let lookupCalls = 0;
    let classifyCalls = 0;

    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api/scan/resolve") {
        const body = JSON.parse(String(init?.body || "{}"));
        if (body.input === "048121277079" || body.input === "0048121277079") {
          return new Response(
            JSON.stringify({
              kind: "barcode",
              barcode: { id: 1080, variant_id: 1090, barcode: "048121277079", default_quantity: 2 },
              variant_id: 1090,
              variant_name: "THOMAS' Plain Bagels",
              product: {
                id: 95,
                name: "Bagel",
                category_id: 1,
                category_name: "Bakery",
                default_location_id: 1,
                default_location_name: "Pantry",
                default_due_days: 10,
                calculated_due_days: null,
                use_average_for_due_date: false,
                label_print_mode: "per_item",
              },
              items: [],
            }),
            { status: 200 }
          );
        }
        return new Response(JSON.stringify({ kind: "unknown", barcode: body.input }), { status: 200 });
      }
      if (url === "/api/upc/lookup") {
        lookupCalls += 1;
        return new Promise<Response>((resolve) => {
          resolveUpc = resolve;
        });
      }
      if (url === "/api/upc/classify") {
        classifyCalls += 1;
        return new Promise<Response>((resolve) => {
          resolveClassify = resolve;
        });
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
          categories={[{ id: 1, name: "Bakery", parent_id: null, hierarchy_name: "Bakery" }]}
          locations={[{ id: 1, name: "Pantry", parent_id: null, is_freezer: false, hierarchy_name: "Pantry" }]}
        />
      </QueryClientProvider>
    );

    const input = screen.getByLabelText("Barcode or search input");
    const submitCode = (code: string) => {
      fireEvent.change(input, { target: { value: code } });
      fireEvent.submit(input.closest("form")!);
    };

    // 1. Direct scan of a known barcode skips OpenFoodFacts lookup and LLM classification
    submitCode("048121277079");
    await waitFor(() => expect(screen.getByText("Confirm & Add: Bagel")).toBeInTheDocument());
    expect(screen.getByText("Matched Bagel (THOMAS' Plain Bagels)")).toBeInTheDocument();
    expect(lookupCalls).toBe(0);
    expect(classifyCalls).toBe(0);
    expect(screen.queryByText("Looking up barcode in OpenFoodFacts...")).not.toBeInTheDocument();
    expect(screen.queryByText("Classifying product...")).not.toBeInTheDocument();

    // 2. Start an unknown barcode lookup + classification, then scan a known barcode before it completes
    submitCode("999888777666");
    await waitFor(() =>
      expect(screen.getByText("Looking up barcode in OpenFoodFacts...")).toBeInTheDocument()
    );
    resolveUpc(
      new Response(
        JSON.stringify({ found: true, result: { title: "Unknown Mystery Snack", measurement: "8 oz" } }),
        { status: 200 }
      )
    );
    await waitFor(() => expect(screen.getByText("Classifying product...")).toBeInTheDocument());

    // Now scan the known barcode (using its 13-digit EAN-13 form) while classification is in flight
    submitCode("0048121277079");
    await waitFor(() => expect(screen.getByText("Confirm & Add: Bagel")).toBeInTheDocument());
    expect(screen.queryByText("Classifying product...")).not.toBeInTheDocument();
    expect(screen.queryByText(/OpenFoodFacts: Unknown Mystery Snack/)).not.toBeInTheDocument();

    // Late classification response from the earlier scan is discarded and does not flip UI back
    resolveClassify(
      new Response(
        JSON.stringify({
          enabled: true,
          classification: { product_name: "Mystery Snack", category_id: 1 },
        }),
        { status: 200 }
      )
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByText("Confirm & Add: Bagel")).toBeInTheDocument();
    expect(screen.queryByText("Create Product & Add Items")).not.toBeInTheDocument();
  });

  it("debounces equivalent 12-digit UPC-A and 13-digit leading-zero EAN-13 scans within 1500ms", () => {
    const onScan = vi.fn();
    render(<BarcodeScanner onScan={onScan} />);

    const input = screen.getByLabelText("Barcode or search input");
    fireEvent.change(input, { target: { value: "048121277079" } });
    fireEvent.submit(input.closest("form")!);

    // Equivalent 13-digit EAN-13 within debounce window is ignored
    fireEvent.change(input, { target: { value: "0048121277079" } });
    fireEvent.submit(input.closest("form")!);

    expect(onScan).toHaveBeenCalledTimes(1);
    expect(onScan).toHaveBeenCalledWith("048121277079");

    // Different barcode is not debounced
    fireEvent.change(input, { target: { value: "048121277080" } });
    fireEvent.submit(input.closest("form")!);
    expect(onScan).toHaveBeenCalledTimes(2);
    expect(onScan).toHaveBeenLastCalledWith("048121277080");
  });

  it("auto-selects LLM-matched existing product on unknown barcode and supports Create new instead", async () => {
    const matchedProd = {
      id: 42,
      name: "Mustard, Dijon",
      category_id: 1,
      category_name: "Condiments",
      default_location_id: 1,
      default_location_name: "Fridge",
      default_due_days: 90,
      use_average_for_due_date: false,
      label_print_mode: "per_item",
      in_stock_count: 1,
    };

    let classifyBody: Record<string, unknown> | null = null;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url === "/api/scan/resolve") {
          return new Response(JSON.stringify({ kind: "unknown", barcode: "011122233344" }), { status: 200 });
        }
        if (url === "/api/upc/lookup") {
          return new Response(
            JSON.stringify({
              found: true,
              result: {
                barcode: "011122233344",
                title: "Burman's Dijon Mustard",
                description: "Organic Dijon Mustard",
                measurement: "12 oz",
              },
            }),
            { status: 200 }
          );
        }
        if (url === "/api/upc/classify") {
          classifyBody = JSON.parse(String(init?.body || "{}"));
          return new Response(
            JSON.stringify({
              enabled: true,
              classification: {
                product_name: "Mustard, Dijon",
                matched_product_id: 42,
                product_value: 12,
                product_unit_type: "weight",
                product_unit: "oz",
                category_id: 1,
              },
              matched_product: matchedProd,
            }),
            { status: 200 }
          );
        }
        return new Response(JSON.stringify({ products: [] }), { status: 200 });
      })
    );

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <ScannerDrawer
          open={true}
          initialMode="purchase"
          onClose={() => {}}
          categories={[{ id: 1, name: "Condiments", parent_id: null, hierarchy_name: "Condiments" }]}
          locations={[{ id: 1, name: "Fridge", parent_id: null, is_freezer: false, hierarchy_name: "Fridge" }]}
        />
      </QueryClientProvider>
    );

    const input = screen.getByLabelText("Barcode or search input");
    fireEvent.change(input, { target: { value: "011122233344" } });
    fireEvent.submit(input.closest("form")!);

    // Should auto-select the matched existing product and show the banner
    await waitFor(() => expect(screen.getByTestId("llm-matched-product-banner")).toBeInTheDocument());
    expect(screen.getByText("Confirm & Add: Mustard, Dijon")).toBeInTheDocument();
    expect(classifyBody).toMatchObject({
      title: "Burman's Dijon Mustard",
      description: "Organic Dijon Mustard",
      quantity: "12 oz",
    });

    // Clicking "Create new product instead" switches to Create New with LLM suggestion pre-filled
    fireEvent.click(screen.getByRole("button", { name: "Create new product instead" }));
    expect(screen.getByText("Create Product & Add Items")).toBeInTheDocument();
    expect((screen.getByPlaceholderText("Product name") as HTMLInputElement).value).toBe("Mustard, Dijon");
    expect((screen.getByLabelText("Variant name") as HTMLInputElement).value).toBe("Burman's Dijon Mustard");
  });

  it("shows live similar existing products when typing a new product name in Purchase mode", async () => {
    const existingApple = {
      id: 77,
      name: "Apples, Gala",
      category_id: 1,
      category_name: "Produce",
      default_location_id: 1,
      default_location_name: "Fridge",
      default_due_days: 14,
      use_average_for_due_date: false,
      label_print_mode: "per_item",
      in_stock_count: 2,
    };

    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url === "/api/scan/resolve") {
          return new Response(JSON.stringify({ kind: "unknown", barcode: "055566677788" }), { status: 200 });
        }
        if (url === "/api/upc/lookup") {
          return new Response(JSON.stringify({ found: false }), { status: 200 });
        }
        if (url.startsWith("/api/products?status=all&q=")) {
          return new Response(JSON.stringify({ products: [existingApple] }), { status: 200 });
        }
        return new Response(JSON.stringify({}), { status: 200 });
      })
    );

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <ScannerDrawer
          open={true}
          initialMode="purchase"
          onClose={() => {}}
          categories={[{ id: 1, name: "Produce", parent_id: null, hierarchy_name: "Produce" }]}
          locations={[{ id: 1, name: "Fridge", parent_id: null, is_freezer: false, hierarchy_name: "Fridge" }]}
        />
      </QueryClientProvider>
    );

    const input = screen.getByLabelText("Barcode or search input");
    fireEvent.change(input, { target: { value: "055566677788" } });
    fireEvent.submit(input.closest("form")!);

    const nameInput = await screen.findByPlaceholderText("Product name");
    fireEvent.change(nameInput, { target: { value: "Apples, Ga" } });

    const similarBox = await screen.findByTestId("scanner-similar-products");
    expect(similarBox).toHaveTextContent("Apples, Gala");

    // Clicking the similar product switches directly to Confirm & Add
    fireEvent.click(screen.getByRole("button", { name: /Apples, Gala/i }));
    expect(screen.getByText("Confirm & Add: Apples, Gala")).toBeInTheDocument();
  });

  it("leaves Category and Location unselected for new products without defaults and blocks submission until both are selected", async () => {
    let purchaseCalls = 0;
    let purchaseBody: Record<string, unknown> | null = null;

    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url === "/api/scan/resolve") {
          return new Response(JSON.stringify({ kind: "unknown", barcode: "099988877766" }), { status: 200 });
        }
        if (url === "/api/upc/lookup") {
          return new Response(JSON.stringify({ found: false }), { status: 200 });
        }
        if (url === "/api/workflows/purchase") {
          purchaseCalls += 1;
          purchaseBody = JSON.parse(String(init?.body || "{}"));
          return new Response(
            JSON.stringify({ product: { id: 10, name: "New Snack" }, items: [{ id: 1 }] }),
            { status: 201 }
          );
        }
        return new Response(JSON.stringify({ products: [] }), { status: 200 });
      })
    );

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <ScannerDrawer
          open={true}
          initialMode="purchase"
          onClose={() => {}}
          categories={[
            { id: 1, name: "Beverages", parent_id: null, hierarchy_name: "Beverages" },
            { id: 2, name: "Snacks", parent_id: null, hierarchy_name: "Snacks" },
          ]}
          locations={[
            { id: 1, name: "Fridge", parent_id: null, is_freezer: false, hierarchy_name: "Fridge" },
            { id: 2, name: "Pantry", parent_id: null, is_freezer: false, hierarchy_name: "Pantry" },
          ]}
        />
      </QueryClientProvider>
    );

    const input = screen.getByLabelText("Barcode or search input");
    fireEvent.change(input, { target: { value: "099988877766" } });
    fireEvent.submit(input.closest("form")!);

    const nameInput = await screen.findByPlaceholderText("Product name");
    fireEvent.change(nameInput, { target: { value: "New Snack" } });

    const catBtn = screen.getByRole("button", { name: "New product category" });
    const locBtn = screen.getByRole("button", { name: "Purchase location" });
    const submitBtn = screen.getByRole("button", { name: /Confirm & Add/i });

    expect(catBtn).toHaveTextContent("Select category");
    expect(locBtn).toHaveTextContent("Select location");
    expect(submitBtn).toBeDisabled();

    // Programmatic submit while both are unselected shows validation error and does not call API
    fireEvent.submit(submitBtn.closest("form")!);
    expect(screen.getByText("Please select a category and location.")).toBeInTheDocument();
    expect(purchaseCalls).toBe(0);

    // Selecting only category still blocks submission
    fireEvent.click(catBtn);
    fireEvent.click(screen.getByRole("button", { name: "Snacks" }));
    expect(submitBtn).toBeDisabled();
    fireEvent.submit(submitBtn.closest("form")!);
    expect(screen.getByText("Please select a location.")).toBeInTheDocument();
    expect(purchaseCalls).toBe(0);

    // Selecting location enables submission and submits chosen IDs
    fireEvent.click(locBtn);
    fireEvent.click(screen.getByRole("button", { name: "Pantry" }));
    expect(submitBtn).not.toBeDisabled();
    fireEvent.click(submitBtn);

    await waitFor(() => expect(purchaseCalls).toBe(1));
    expect(purchaseBody).toMatchObject({
      location_id: 2,
      new_product: {
        name: "New Snack",
        category_id: 2,
        default_location_id: 2,
      },
    });
  });

  it("preserves user-selected category when in-flight LLM classification resolves with a different category", async () => {
    let resolveClassify!: (resp: Response) => void;

    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url === "/api/scan/resolve") {
          return new Response(JSON.stringify({ kind: "unknown", barcode: "044455566677" }), { status: 200 });
        }
        if (url === "/api/upc/lookup") {
          return new Response(
            JSON.stringify({ found: true, result: { title: "Sparkling Water", measurement: "12 fl oz" } }),
            { status: 200 }
          );
        }
        if (url === "/api/upc/classify") {
          return new Promise<Response>((resolve) => {
            resolveClassify = resolve;
          });
        }
        return new Response(JSON.stringify({ products: [] }), { status: 200 });
      })
    );

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <ScannerDrawer
          open={true}
          initialMode="purchase"
          onClose={() => {}}
          categories={[
            { id: 1, name: "Beverages", parent_id: null, hierarchy_name: "Beverages" },
            { id: 2, name: "Pantry Goods", parent_id: null, hierarchy_name: "Pantry Goods" },
          ]}
          locations={[
            { id: 1, name: "Fridge", parent_id: null, is_freezer: false, hierarchy_name: "Fridge" },
          ]}
        />
      </QueryClientProvider>
    );

    const input = screen.getByLabelText("Barcode or search input");
    fireEvent.change(input, { target: { value: "044455566677" } });
    fireEvent.submit(input.closest("form")!);

    await waitFor(() => expect(screen.getByText("Classifying product...")).toBeInTheDocument());

    // User manually picks Pantry Goods while classification is still in flight
    fireEvent.click(screen.getByRole("button", { name: "New product category" }));
    fireEvent.click(screen.getByRole("button", { name: "Pantry Goods" }));
    expect(screen.getByRole("button", { name: "New product category" })).toHaveTextContent("Pantry Goods");

    // Classification resolves with Beverages (id: 1) -> must not overwrite user's choice
    resolveClassify(
      new Response(
        JSON.stringify({
          enabled: true,
          classification: {
            product_name: "Water, Sparkling",
            category_id: 1,
          },
        }),
        { status: 200 }
      )
    );

    await waitFor(() => expect(screen.queryByText("Classifying product...")).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: "New product category" })).toHaveTextContent("Pantry Goods");
    expect(screen.getByRole("button", { name: "Purchase location" })).toHaveTextContent("Select location");
  });

  it("clears matched product location on Create new product instead while keeping LLM category", async () => {
    const matchedProd = {
      id: 42,
      name: "Mustard, Dijon",
      category_id: 2,
      category_name: "Condiments",
      default_location_id: 1,
      default_location_name: "Fridge",
      default_due_days: 90,
      use_average_for_due_date: false,
      label_print_mode: "per_item",
      in_stock_count: 1,
    };

    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url === "/api/scan/resolve") {
          return new Response(JSON.stringify({ kind: "unknown", barcode: "011122233399" }), { status: 200 });
        }
        if (url === "/api/upc/lookup") {
          return new Response(
            JSON.stringify({ found: true, result: { title: "Artisan Mustard", measurement: "8 oz" } }),
            { status: 200 }
          );
        }
        if (url === "/api/upc/classify") {
          return new Response(
            JSON.stringify({
              enabled: true,
              classification: {
                product_name: "Mustard, Whole Grain",
                matched_product_id: 42,
                category_id: 2,
              },
              matched_product: matchedProd,
            }),
            { status: 200 }
          );
        }
        return new Response(JSON.stringify({ products: [] }), { status: 200 });
      })
    );

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <ScannerDrawer
          open={true}
          initialMode="purchase"
          onClose={() => {}}
          categories={[
            { id: 1, name: "Baking", parent_id: null, hierarchy_name: "Baking" },
            { id: 2, name: "Condiments", parent_id: null, hierarchy_name: "Condiments" },
          ]}
          locations={[
            { id: 1, name: "Fridge", parent_id: null, is_freezer: false, hierarchy_name: "Fridge" },
            { id: 2, name: "Pantry", parent_id: null, is_freezer: false, hierarchy_name: "Pantry" },
          ]}
        />
      </QueryClientProvider>
    );

    const input = screen.getByLabelText("Barcode or search input");
    fireEvent.change(input, { target: { value: "011122233399" } });
    fireEvent.submit(input.closest("form")!);

    await waitFor(() => expect(screen.getByTestId("llm-matched-product-banner")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Purchase location" })).toHaveTextContent("Fridge");

    // Switching to Create new product instead keeps LLM category but clears location and blocks submit
    fireEvent.click(screen.getByRole("button", { name: "Create new product instead" }));
    expect(screen.getByRole("button", { name: "New product category" })).toHaveTextContent("Condiments");
    expect(screen.getByRole("button", { name: "Purchase location" })).toHaveTextContent("Select location");
    expect(screen.getByRole("button", { name: /Confirm & Add/i })).toBeDisabled();
  });

  it("leaves Category and Location unselected on unmatched text search in Purchase mode", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url === "/api/scan/resolve") {
          return new Response(JSON.stringify({ kind: "unknown", barcode: "Dragonfruit" }), { status: 200 });
        }
        if (url.startsWith("/api/products?status=all&q=")) {
          return new Response(JSON.stringify({ products: [] }), { status: 200 });
        }
        return new Response(JSON.stringify({}), { status: 200 });
      })
    );

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <ScannerDrawer
          open={true}
          initialMode="purchase"
          onClose={() => {}}
          categories={[
            { id: 1, name: "Produce", parent_id: null, hierarchy_name: "Produce" },
          ]}
          locations={[
            { id: 1, name: "Fridge", parent_id: null, is_freezer: false, hierarchy_name: "Fridge" },
          ]}
        />
      </QueryClientProvider>
    );

    const input = screen.getByLabelText("Barcode or search input");
    fireEvent.change(input, { target: { value: "Dragonfruit" } });
    fireEvent.submit(input.closest("form")!);

    await waitFor(() => expect(screen.getByText("Create Product & Add Items")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "New product category" })).toHaveTextContent("Select category");
    expect(screen.getByRole("button", { name: "Purchase location" })).toHaveTextContent("Select location");
    expect(screen.getByRole("button", { name: /Confirm & Add/i })).toBeDisabled();
  });

  it("allows creating categories and locations inline inside the Purchase workflow dropdowns", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api/scan/resolve") {
        return new Response(JSON.stringify({ kind: "unknown", barcode: "Dragonfruit" }), { status: 200 });
      }
      if (url.startsWith("/api/products?status=all&q=")) {
        return new Response(JSON.stringify({ products: [] }), { status: 200 });
      }
      if (url === "/api/categories" && init?.method === "POST") {
        const body = JSON.parse(String(init.body));
        return new Response(
          JSON.stringify({ category: { id: 10, name: body.name, parent_id: null, hierarchy_name: body.name } }),
          { status: 201 }
        );
      }
      if (url === "/api/locations" && init?.method === "POST") {
        const body = JSON.parse(String(init.body));
        return new Response(
          JSON.stringify({
            location: {
              id: 20,
              name: body.name,
              parent_id: null,
              is_freezer: Boolean(body.is_freezer),
              hierarchy_name: body.name,
            },
          }),
          { status: 201 }
        );
      }
      return new Response(JSON.stringify({}), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
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

    const input = screen.getByLabelText("Barcode or search input");
    fireEvent.change(input, { target: { value: "Dragonfruit" } });
    fireEvent.submit(input.closest("form")!);

    await waitFor(() => expect(screen.getByText("Create Product & Add Items")).toBeInTheDocument());

    // Inline create category from empty picker
    fireEvent.click(screen.getByRole("button", { name: "New product category" }));
    fireEvent.change(screen.getByLabelText("Search New product category"), { target: { value: "Produce" } });
    fireEvent.click(screen.getByRole("button", { name: /Create “Produce”/ }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "New product category" })).toHaveTextContent("Produce")
    );

    // Inline create location from empty picker
    fireEvent.click(screen.getByRole("button", { name: "Purchase location" }));
    fireEvent.change(screen.getByLabelText("Search Purchase location"), { target: { value: "Fridge" } });
    fireEvent.click(screen.getByRole("button", { name: /Create “Fridge”/ }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Purchase location" })).toHaveTextContent("Fridge")
    );

    // Confirm & Add becomes enabled now that both category and location are selected
    expect(screen.getByRole("button", { name: /Confirm & Add/i })).not.toBeDisabled();
  });
});

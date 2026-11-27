import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ProductFormPage } from "./ProductFormPage";

describe("ProductFormPage rolling-average due days default", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("checks rolling average by default on new product and disables manual Due Days until unchecked", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url === "/api/categories") {
          return new Response(JSON.stringify({ categories: [{ id: 1, name: "Dairy", parent_id: null, hierarchy_name: "Dairy" }] }), { status: 200 });
        }
        if (url === "/api/locations") {
          return new Response(JSON.stringify({ locations: [{ id: 1, name: "Fridge", parent_id: null, is_freezer: false, hierarchy_name: "Fridge" }] }), { status: 200 });
        }
        return new Response(JSON.stringify({}), { status: 200 });
      })
    );

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={["/products/new"]}>
          <Routes>
            <Route path="/products/new" element={<ProductFormPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );

    const checkbox = screen.getByRole("checkbox", {
      name: /Calculate due date from rolling average/i,
    }) as HTMLInputElement;
    const dueDaysInput = screen.getByLabelText("Due Days") as HTMLInputElement;

    expect(checkbox.checked).toBe(true);
    expect(dueDaysInput.disabled).toBe(true);

    // Unchecking re-enables manual Due Days entry
    fireEvent.click(checkbox);
    expect(checkbox.checked).toBe(false);
    expect(dueDaysInput.disabled).toBe(false);
  });

  it("shows live similar existing products and surfaces 409 duplicate conflicts inline", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url === "/api/categories") {
          return new Response(JSON.stringify({ categories: [{ id: 1, name: "Produce", parent_id: null, hierarchy_name: "Produce" }] }), { status: 200 });
        }
        if (url === "/api/locations") {
          return new Response(JSON.stringify({ locations: [{ id: 1, name: "Fridge", parent_id: null, is_freezer: false, hierarchy_name: "Fridge" }] }), { status: 200 });
        }
        if (url.startsWith("/api/products?status=all&q=")) {
          return new Response(
            JSON.stringify({
              products: [
                { id: 12, name: "Apples, Gala", category_name: "Produce" },
                { id: 13, name: "Apples, Red", category_name: "Produce" },
              ],
            }),
            { status: 200 }
          );
        }
        if (url === "/api/products" && init?.method === "POST") {
          return new Response(
            JSON.stringify({
              error: 'A product named "Apples, Gala" already exists.',
              existing_product: { id: 12, name: "Apples, Gala" },
            }),
            { status: 409 }
          );
        }
        return new Response(JSON.stringify({}), { status: 200 });
      })
    );

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={["/products/new"]}>
          <Routes>
            <Route path="/products/new" element={<ProductFormPage />} />
            <Route path="/products/:id" element={<div>Product Detail</div>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );

    expect(screen.getByText(/Item, Variety, Detail/i)).toBeInTheDocument();

    const nameInput = screen.getByLabelText("Product Name");
    fireEvent.change(nameInput, { target: { value: "Apples, Gala" } });

    const similar = await screen.findByTestId("product-form-similar-products");
    expect(similar).toHaveTextContent("Apples, Gala");
    expect(similar).toHaveTextContent("Exact match");
    expect(similar).toHaveTextContent("Apples, Red");

    // Submit triggers 409 conflict surfaced inline with link to existing product
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent('A product named "Apples, Gala" already exists.');
    expect(screen.getByRole("link", { name: "View Apples, Gala" })).toHaveAttribute("href", "/products/12");
  });

  it("shows Label Print Mode when printers are enabled and omits it while preserving label_print_mode when disabled", async () => {
    const submittedBodies: Array<Record<string, unknown>> = [];
    let printersEnabled = true;

    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url === "/api/auth/status") {
          return new Response(
            JSON.stringify({ initialized: true, oidc_enabled: false, oidc_force: false, printers_enabled: printersEnabled, user: { id: 1, email: "a@b.c", role: "admin" } }),
            { status: 200 }
          );
        }
        if (url === "/api/categories") {
          return new Response(JSON.stringify({ categories: [{ id: 1, name: "Dairy", parent_id: null, hierarchy_name: "Dairy" }] }), { status: 200 });
        }
        if (url === "/api/locations") {
          return new Response(JSON.stringify({ locations: [{ id: 1, name: "Fridge", parent_id: null, is_freezer: false, hierarchy_name: "Fridge" }] }), { status: 200 });
        }
        if (url === "/api/products/5" && (!init?.method || init.method === "GET")) {
          return new Response(
            JSON.stringify({
              product: {
                id: 5,
                name: "Milk, Whole",
                category_id: 1,
                category_name: "Dairy",
                default_location_id: 1,
                default_location_name: "Fridge",
                default_due_days: 7,
                default_due_days_on_open: null,
                default_due_days_on_freeze: null,
                default_due_days_on_thaw: null,
                use_average_for_due_date: false,
                label_print_mode: "single",
                minimum_value: 1,
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
            }),
            { status: 200 }
          );
        }
        if (url === "/api/products/5" && init?.method === "PATCH") {
          submittedBodies.push(JSON.parse(String(init.body)));
          return new Response(JSON.stringify({ product: { id: 5 } }), { status: 200 });
        }
        return new Response(JSON.stringify({}), { status: 200 });
      })
    );

    // 1. Printers enabled -> Label Print Mode select is rendered
    const qc1 = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { unmount } = render(
      <QueryClientProvider client={qc1}>
        <MemoryRouter initialEntries={["/products/5/edit"]}>
          <Routes>
            <Route path="/products/:id/edit" element={<ProductFormPage />} />
            <Route path="/products/:id" element={<div>Product Detail</div>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );
    expect(await screen.findByLabelText("Label Print Mode")).toBeInTheDocument();
    unmount();

    // 2. Printers disabled -> Label Print Mode select is omitted, existing "single" mode is preserved on save
    printersEnabled = false;
    const qc2 = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc2}>
        <MemoryRouter initialEntries={["/products/5/edit"]}>
          <Routes>
            <Route path="/products/:id/edit" element={<ProductFormPage />} />
            <Route path="/products/:id" element={<div>Product Detail</div>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );
    expect(await screen.findByDisplayValue("Milk, Whole")).toBeInTheDocument();
    expect(screen.queryByLabelText("Label Print Mode")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Product Detail")).toBeInTheDocument();
    expect(submittedBodies[0]?.label_print_mode).toBe("single");
  });
});

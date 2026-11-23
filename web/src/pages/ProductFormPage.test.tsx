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
});

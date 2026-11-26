import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HelpProvider } from "../components/HelpContext";
import { HelpPage } from "./HelpPage";
import { SettingsPage } from "./SettingsPage";

describe("In-app Help and Contextual Help", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("focuses search on /help landing, renders all nine task entries, and searches offline guides", async () => {
    render(
      <MemoryRouter initialEntries={["/help"]}>
        <Routes>
          <Route path="/help" element={<HelpPage />} />
          <Route path="/help/*" element={<HelpPage />} />
        </Routes>
      </MemoryRouter>
    );

    const searchInput = screen.getByLabelText(/Search offline Help/i);
    expect(document.activeElement).toBe(searchInput);

    expect(screen.getByText("Add your first product")).toBeInTheDocument();
    expect(screen.getByText("Scan a barcode to purchase or consume")).toBeInTheDocument();
    expect(screen.getByText("Organize locations and categories")).toBeInTheDocument();
    expect(screen.getByText("Track expiration dates and due rules")).toBeInTheDocument();
    expect(screen.getByText("Manage your shopping list")).toBeInTheDocument();
    expect(screen.getByText("Print QR labels on a Zebra printer")).toBeInTheDocument();
    expect(screen.getAllByText("Install itemized on your phone").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Use keyboard shortcuts")).toBeInTheDocument();
    expect(screen.getByText("Self-host itemized")).toBeInTheDocument();

    fireEvent.change(searchInput, { target: { value: "ZPL" } });
    expect(screen.getByRole("status").textContent).toMatch(/guide/);
    expect(screen.getAllByText(/Label printing and ZPL templates/i).length).toBeGreaterThanOrEqual(1);

    // Navigate to article view
    fireEvent.click(screen.getByText("Print QR labels on a Zebra printer"));
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Label printing and ZPL templates" })).toBeInTheDocument();
    });
  });

  it("opens contextual Help from a Settings card without discarding unsaved input", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url === "/api/settings") {
          return new Response(
            JSON.stringify({
              base_url: "https://itemized.example.com",
              due_date_average_count: 3,
              oidc_issuer: "",
              oidc_client_id: "",
              oidc_has_secret: false,
              oidc_auto_provision: false,
              oidc_force: false,
              llm_provider: "",
              llm_model: "",
              llm_base_url: "",
              llm_has_api_key: false,
            }),
            { status: 200 }
          );
        }
        if (url === "/api/users") return new Response(JSON.stringify({ users: [] }), { status: 200 });
        if (url === "/api/printers") return new Response(JSON.stringify({ printers: [] }), { status: 200 });
        if (url === "/api/label-templates") return new Response(JSON.stringify({ templates: [] }), { status: 200 });
        return new Response(JSON.stringify({}), { status: 200 });
      })
    );

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={["/settings"]}>
          <HelpProvider>
            <SettingsPage user={{ id: 1, email: "admin@example.com", role: "admin", created_at: "", updated_at: "" }} />
          </HelpProvider>
        </MemoryRouter>
      </QueryClientProvider>
    );

    // Type unsaved input in Printer name field
    const printerInput = screen.getByPlaceholderText("Printer name") as HTMLInputElement;
    fireEvent.change(printerInput, { target: { value: "Kitchen Zebra" } });
    expect(printerInput.value).toBe("Kitchen Zebra");

    // Click Learn more on Label Printers card
    const learnMoreBtn = document.querySelector('button[data-help-screen="settings/printers"]') as HTMLButtonElement;
    expect(learnMoreBtn).not.toBeNull();
    fireEvent.click(learnMoreBtn);

    const drawer = await screen.findByTestId("contextual-help-drawer");
    await waitFor(() => {
      expect(drawer.textContent).toContain("Label printing and ZPL templates");
    });

    // Close contextual help and confirm unsaved input is preserved
    fireEvent.click(screen.getByRole("button", { name: "Close contextual help" }));
    expect(screen.queryByTestId("contextual-help-drawer")).not.toBeInTheDocument();
    expect(printerInput.value).toBe("Kitchen Zebra");
  });
});

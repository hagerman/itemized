import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { HierarchySelect, HierarchyItem } from "./HierarchySelect";

const SAMPLE_LOCATIONS: HierarchyItem[] = [
  { id: 1, name: "Kitchen", parent_id: null, hierarchy_name: "Kitchen" },
  { id: 2, name: "Fridge", parent_id: 1, hierarchy_name: "Kitchen > Fridge" },
  { id: 3, name: "Top Shelf", parent_id: 2, hierarchy_name: "Kitchen > Fridge > Top Shelf" },
  { id: 4, name: "Pantry", parent_id: null, hierarchy_name: "Pantry" },
  { id: 5, name: "Garage", parent_id: null, hierarchy_name: "Garage" },
  { id: 6, name: "Bottom Shelf", parent_id: 5, hierarchy_name: "Garage > Bottom Shelf" },
];

describe("HierarchySelect (searchable hierarchical drill-down)", () => {
  it("selects leaf nodes directly and drills into parent nodes with Select Parent option", () => {
    const onChange = vi.fn();
    render(
      <HierarchySelect
        items={SAMPLE_LOCATIONS}
        value={null}
        onChange={onChange}
        ariaLabel="Location"
        placeholder="Choose location"
      />
    );

    // Open dropdown -> shows only top-level items
    fireEvent.click(screen.getByRole("button", { name: "Location" }));
    expect(screen.getByText("Kitchen")).toBeInTheDocument();
    expect(screen.getByText("Pantry")).toBeInTheDocument();
    expect(screen.queryByText("Fridge")).not.toBeInTheDocument();

    // Clicking leaf ("Pantry") selects it directly
    fireEvent.click(screen.getByText("Pantry"));
    expect(onChange).toHaveBeenCalledWith(4);

    // Re-open and drill into Kitchen -> verify icon-only back button (no visible "Back" text)
    fireEvent.click(screen.getByRole("button", { name: "Location" }));
    fireEvent.click(screen.getByText("Kitchen"));
    const backBtn = screen.getByRole("button", { name: "Back" });
    expect(backBtn.textContent?.trim()).toBe("");
    expect(screen.getByText(/Select “Kitchen”/)).toBeInTheDocument();
    expect(screen.getByText("Fridge")).toBeInTheDocument();

    // Clicking icon-only back returns to root level
    fireEvent.click(backBtn);
    expect(screen.getByText("Pantry")).toBeInTheDocument();
    expect(screen.queryByText(/Select “Kitchen”/)).not.toBeInTheDocument();

    // Drill into Kitchen -> Fridge -> Select "Fridge"
    fireEvent.click(screen.getByText("Kitchen"));
    fireEvent.click(screen.getByText("Fridge"));
    expect(screen.getByText(/Select “Fridge”/)).toBeInTheDocument();
    expect(screen.getByText("Top Shelf")).toBeInTheDocument();

    fireEvent.click(screen.getByText(/Select “Fridge”/));
    expect(onChange).toHaveBeenCalledWith(2);
  });

  it("searches across all hierarchies from both root and drilled-in levels and renders full paths", () => {
    const onChange = vi.fn();
    render(
      <HierarchySelect
        items={SAMPLE_LOCATIONS}
        value={null}
        onChange={onChange}
        ariaLabel="Location"
      />
    );

    // Open and drill into Kitchen
    fireEvent.click(screen.getByRole("button", { name: "Location" }));
    fireEvent.click(screen.getByText("Kitchen"));
    expect(screen.getByText(/Select “Kitchen”/)).toBeInTheDocument();

    // Search "shelf" while drilled into Kitchen -> finds BOTH Kitchen and Garage matches
    const searchInput = screen.getByLabelText("Search Location");
    fireEvent.change(searchInput, { target: { value: "shelf" } });

    expect(screen.getByText("Kitchen > Fridge > Top Shelf")).toBeInTheDocument();
    expect(screen.getByText("Garage > Bottom Shelf")).toBeInTheDocument();

    // Clearing search restores drilled-in Kitchen level
    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
    expect(screen.getByText(/Select “Kitchen”/)).toBeInTheDocument();
    expect(screen.getByText("Fridge")).toBeInTheDocument();

    // Search again and select cross-branch match
    fireEvent.change(searchInput, { target: { value: "bottom" } });
    fireEvent.click(screen.getByText("Garage > Bottom Shelf"));
    expect(onChange).toHaveBeenCalledWith(6);
  });

  it("renders floating menu in a document.body portal by default and inline menu in normal flow when inlineMenu is set", () => {
    const onChange = vi.fn();
    const { container, rerender } = render(
      <HierarchySelect
        items={SAMPLE_LOCATIONS}
        value={null}
        onChange={onChange}
        ariaLabel="Portal Location"
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Portal Location" }));
    const portalMenu = screen.getByTestId("hierarchy-portal-menu");
    expect(portalMenu).toBeInTheDocument();
    expect(container.contains(portalMenu)).toBe(false);
    fireEvent.click(screen.getByText("Pantry"));
    expect(onChange).toHaveBeenCalledWith(4);

    rerender(
      <HierarchySelect
        items={SAMPLE_LOCATIONS}
        value={null}
        onChange={onChange}
        ariaLabel="Inline Location"
        inlineMenu
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Inline Location" }));
    const inlineMenu = screen.getByTestId("hierarchy-inline-menu");
    expect(inlineMenu).toBeInTheDocument();
    expect(container.contains(inlineMenu)).toBe(true);
  });
});

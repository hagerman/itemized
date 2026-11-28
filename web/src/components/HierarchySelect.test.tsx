import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { collectDescendantIds, HierarchySelect, HierarchyItem } from "./HierarchySelect";

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

  it("collectDescendantIds returns the root ID and all transitive descendants", () => {
    expect(Array.from(collectDescendantIds(1, SAMPLE_LOCATIONS)).sort((a, b) => a - b)).toEqual([1, 2, 3]);
    expect(Array.from(collectDescendantIds(2, SAMPLE_LOCATIONS)).sort((a, b) => a - b)).toEqual([2, 3]);
    expect(Array.from(collectDescendantIds(4, SAMPLE_LOCATIONS))).toEqual([4]);
  });

  it("supports default (h-10) and compact sm (h-8) trigger sizes", () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <HierarchySelect
        items={SAMPLE_LOCATIONS}
        value={null}
        onChange={onChange}
        ariaLabel="Sized Location"
      />
    );

    const defaultBtn = screen.getByRole("button", { name: "Sized Location" });
    expect(defaultBtn).toHaveClass("h-10", "px-3", "text-sm");
    expect(defaultBtn).not.toHaveClass("h-8");

    rerender(
      <HierarchySelect
        items={SAMPLE_LOCATIONS}
        value={null}
        onChange={onChange}
        ariaLabel="Sized Location"
        size="sm"
      />
    );

    const compactBtn = screen.getByRole("button", { name: "Sized Location" });
    expect(compactBtn).toHaveClass("h-8", "px-2.5", "text-xs");
    expect(compactBtn).not.toHaveClass("h-10");
  });

  it("supports inline creation at root and drilled-in levels, optional freezer flag, and inline errors", async () => {
    const onChange = vi.fn();
    const onCreate = vi.fn().mockResolvedValue({
      id: 99,
      name: "Spice Rack",
      parent_id: 1,
      hierarchy_name: "Kitchen > Spice Rack",
      is_freezer: false,
    });

    render(
      <HierarchySelect
        items={SAMPLE_LOCATIONS}
        value={null}
        onChange={onChange}
        ariaLabel="Location"
        onCreate={onCreate}
        createEntityLabel="location"
        showFreezerOption
      />
    );

    // Drill into Kitchen, type new child name, create inline
    fireEvent.click(screen.getByRole("button", { name: "Location" }));
    fireEvent.click(screen.getByText("Kitchen"));
    const searchInput = screen.getByLabelText("Search Location");
    fireEvent.change(searchInput, { target: { value: "Spice Rack" } });

    const createBtn = screen.getByRole("button", { name: /Create “Spice Rack” in Kitchen/ });
    fireEvent.click(createBtn);

    await waitFor(() => {
      expect(onCreate).toHaveBeenCalledWith({
        name: "Spice Rack",
        parent_id: 1,
        is_freezer: false,
      });
      expect(onChange).toHaveBeenCalledWith(99);
    });
  });

  it("creates a freezer location inline and keeps dropdown open with error on failure", async () => {
    const onChange = vi.fn();
    const onCreate = vi
      .fn()
      .mockRejectedValueOnce(new Error("duplicate location"))
      .mockResolvedValueOnce({
        id: 100,
        name: "Deep Freeze",
        parent_id: null,
        hierarchy_name: "Deep Freeze",
        is_freezer: true,
      });

    render(
      <HierarchySelect
        items={[]}
        value={null}
        onChange={onChange}
        ariaLabel="Location"
        onCreate={onCreate}
        createEntityLabel="location"
        showFreezerOption
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Location" }));
    expect(screen.getByText(/Type a name above to create a location/)).toBeInTheDocument();

    const searchInput = screen.getByLabelText("Search Location");
    fireEvent.change(searchInput, { target: { value: "Deep Freeze" } });
    expect(screen.queryByRole("checkbox", { name: /Freezer/i })).not.toBeInTheDocument();
    const freezerButton = screen.getByRole("button", { name: /Create Freezer “Deep Freeze”/ });
    const freezerButtonChildren = Array.from(freezerButton.children);
    expect(freezerButtonChildren).toHaveLength(2);
    expect(freezerButtonChildren[0].tagName.toLowerCase()).toBe("svg");
    const labelChildren = Array.from(freezerButtonChildren[1].children);
    expect(labelChildren).toHaveLength(3);
    expect(labelChildren[0].textContent).toBe("Create Freezer");
    expect(labelChildren[1].tagName.toLowerCase()).toBe("svg");
    expect(labelChildren[1].getAttribute("class")).not.toMatch(/text-(sky|indigo)-/);
    expect(labelChildren[2].textContent).toBe("“Deep Freeze”");
    fireEvent.click(freezerButton);

    // Error keeps menu open and preserves typed text
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("duplicate location");
    });
    expect(screen.getByLabelText("Search Location")).toHaveValue("Deep Freeze");

    // Retry succeeds
    fireEvent.click(screen.getByRole("button", { name: /Create Freezer “Deep Freeze”/ }));
    await waitFor(() => {
      expect(onCreate).toHaveBeenLastCalledWith({
        name: "Deep Freeze",
        parent_id: null,
        is_freezer: true,
      });
      expect(onChange).toHaveBeenCalledWith(100);
    });
  });

  it("does not render inline creation when onCreate is omitted", () => {
    render(
      <HierarchySelect
        items={SAMPLE_LOCATIONS}
        value={null}
        onChange={vi.fn()}
        ariaLabel="Location"
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Location" }));
    fireEvent.change(screen.getByLabelText("Search Location"), { target: { value: "Nonexistent" } });
    expect(screen.queryByRole("button", { name: /Create / })).not.toBeInTheDocument();
  });
});

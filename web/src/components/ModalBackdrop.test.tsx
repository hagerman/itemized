import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ModalBackdrop } from "./ModalBackdrop";

describe("ModalBackdrop", () => {
  it("closes when clicking directly on the backdrop", () => {
    const onClose = vi.fn();
    render(
      <ModalBackdrop onClose={onClose} ariaLabel="Example Modal">
        <div>
          <p>Dialog body</p>
        </div>
      </ModalBackdrop>
    );

    const dialog = screen.getByRole("dialog", { name: "Example Modal" });
    expect(dialog).toHaveAttribute("aria-modal", "true");

    fireEvent.mouseDown(dialog);
    fireEvent.click(dialog);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes on synthetic backdrop click without a preceding mousedown", () => {
    const onClose = vi.fn();
    render(
      <ModalBackdrop onClose={onClose} ariaLabel="Synthetic Modal">
        <div>
          <p>Dialog body</p>
        </div>
      </ModalBackdrop>
    );

    const dialog = screen.getByRole("dialog", { name: "Synthetic Modal" });
    fireEvent.click(dialog);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not close when clicking inside the dialog panel", () => {
    const onClose = vi.fn();
    render(
      <ModalBackdrop onClose={onClose} ariaLabel="Example Modal">
        <div>
          <button type="button">Inside Action</button>
        </div>
      </ModalBackdrop>
    );

    const insideBtn = screen.getByRole("button", { name: "Inside Action" });
    fireEvent.mouseDown(insideBtn);
    fireEvent.click(insideBtn);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("does not close when a pointer drag starts inside the dialog and releases on the backdrop", () => {
    const onClose = vi.fn();
    render(
      <ModalBackdrop onClose={onClose} ariaLabel="Drag Modal">
        <div>
          <input aria-label="Text field" defaultValue="hello" />
        </div>
      </ModalBackdrop>
    );

    const dialog = screen.getByRole("dialog", { name: "Drag Modal" });
    const input = screen.getByLabelText("Text field");

    // Simulate dragging from inside the input and releasing on the backdrop
    fireEvent.mouseDown(input);
    fireEvent.mouseUp(dialog);
    fireEvent.click(dialog);
    expect(onClose).not.toHaveBeenCalled();

    // A subsequent fresh click on the backdrop should still close
    fireEvent.mouseDown(dialog);
    fireEvent.click(dialog);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

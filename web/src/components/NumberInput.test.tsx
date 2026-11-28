import React, { useState } from "react";
import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import {
  NumberInput,
  OptionalNumberInput,
  evaluateMathExpression,
  normalizeNumericString,
} from "./NumberInput";

describe("normalizeNumericString", () => {
  it("strips redundant leading zeros while preserving zero and decimals", () => {
    expect(normalizeNumericString("")).toBe("");
    expect(normalizeNumericString("0")).toBe("0");
    expect(normalizeNumericString("00")).toBe("0");
    expect(normalizeNumericString("02")).toBe("2");
    expect(normalizeNumericString("007")).toBe("7");
    expect(normalizeNumericString("0.5")).toBe("0.5");
    expect(normalizeNumericString("00.5")).toBe("0.5");
    expect(normalizeNumericString("-02")).toBe("-2");
    expect(normalizeNumericString("-0.5")).toBe("-0.5");
  });
});

describe("evaluateMathExpression", () => {
  it("evaluates basic arithmetic with operator precedence and parentheses", () => {
    expect(evaluateMathExpression("500/5")).toBe(100);
    expect(evaluateMathExpression("500 / 5")).toBe(100);
    expect(evaluateMathExpression("16.9*6")).toBeCloseTo(101.4, 5);
    expect(evaluateMathExpression("2 + 3 * 4")).toBe(14);
    expect(evaluateMathExpression("(10 + 2) / 3")).toBe(4);
    expect(evaluateMathExpression("12×2")).toBe(24);
    expect(evaluateMathExpression("100÷4")).toBe(25);
    expect(evaluateMathExpression("-5 + 8")).toBe(3);
  });

  it("returns null for empty, malformed, or divide-by-zero expressions", () => {
    expect(evaluateMathExpression("")).toBeNull();
    expect(evaluateMathExpression("   ")).toBeNull();
    expect(evaluateMathExpression("500/")).toBeNull();
    expect(evaluateMathExpression("500/0")).toBeNull();
    expect(evaluateMathExpression("(10+2")).toBeNull();
    expect(evaluateMathExpression("abc")).toBeNull();
    expect(evaluateMathExpression("1 + abc")).toBeNull();
  });
});

describe("NumberInput", () => {
  function ControlledNumber({
    initial = 1,
    min = 1,
    max,
    fallback,
    allowDecimal = false,
  }: {
    initial?: number;
    min?: number;
    max?: number;
    fallback?: number;
    allowDecimal?: boolean;
  }) {
    const [val, setVal] = useState(initial);
    return (
      <div>
        <NumberInput
          aria-label="Qty"
          value={val}
          onChange={setVal}
          min={min}
          max={max}
          fallback={fallback}
          allowDecimal={allowDecimal}
        />
        <span data-testid="committed">{val}</span>
        <button type="button" onClick={() => setVal(1)}>
          Reset
        </button>
      </div>
    );
  }

  it("allows clearing 1 to empty and typing 2 without snapping to 0 or producing 02", () => {
    render(<ControlledNumber initial={1} min={1} />);
    const input = screen.getByLabelText("Qty");

    expect(input).toHaveValue("1");
    fireEvent.change(input, { target: { value: "" } });
    expect(input).toHaveValue("");
    expect(screen.getByTestId("committed")).toHaveTextContent("1");

    fireEvent.change(input, { target: { value: "2" } });
    expect(input).toHaveValue("2");
    expect(screen.getByTestId("committed")).toHaveTextContent("2");
  });

  it("strips leading zeros like 02 immediately", () => {
    render(<ControlledNumber initial={1} min={1} />);
    const input = screen.getByLabelText("Qty");

    fireEvent.change(input, { target: { value: "02" } });
    expect(input).toHaveValue("2");
    expect(screen.getByTestId("committed")).toHaveTextContent("2");
  });

  it("restores fallback/min on blur when left empty or invalid", () => {
    render(<ControlledNumber initial={5} min={1} fallback={3} />);
    const input = screen.getByLabelText("Qty");

    fireEvent.change(input, { target: { value: "" } });
    expect(input).toHaveValue("");
    fireEvent.blur(input);
    expect(input).toHaveValue("3");
    expect(screen.getByTestId("committed")).toHaveTextContent("3");

    fireEvent.change(input, { target: { value: "500/0" } });
    fireEvent.blur(input);
    expect(input).toHaveValue("3");
    expect(screen.getByTestId("committed")).toHaveTextContent("3");

    fireEvent.change(input, { target: { value: "500/" } });
    fireEvent.blur(input);
    expect(input).toHaveValue("3");
  });

  it("evaluates simple math expressions, rounds integers, and clamps to min", () => {
    render(<ControlledNumber initial={1} min={1} />);
    const input = screen.getByLabelText("Qty");

    // Keeps expression visible while typing, commits live, resolves on blur
    fireEvent.change(input, { target: { value: "2*6" } });
    expect(input).toHaveValue("2*6");
    expect(screen.getByTestId("committed")).toHaveTextContent("12");
    fireEvent.blur(input);
    expect(input).toHaveValue("12");

    // Integer rounding (5/2 -> 3)
    fireEvent.change(input, { target: { value: "5/2" } });
    fireEvent.blur(input);
    expect(input).toHaveValue("3");
    expect(screen.getByTestId("committed")).toHaveTextContent("3");

    // Clamping below min (1-5 -> 1)
    fireEvent.change(input, { target: { value: "1-5" } });
    fireEvent.blur(input);
    expect(input).toHaveValue("1");
    expect(screen.getByTestId("committed")).toHaveTextContent("1");
  });

  it("resolves math expression on Enter and supports ArrowUp/ArrowDown stepping", () => {
    render(<ControlledNumber initial={2} min={1} />);
    const input = screen.getByLabelText("Qty");

    fireEvent.change(input, { target: { value: "(10+2)/3" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(input).toHaveValue("4");
    expect(screen.getByTestId("committed")).toHaveTextContent("4");

    fireEvent.keyDown(input, { key: "ArrowUp" });
    expect(input).toHaveValue("5");
    expect(screen.getByTestId("committed")).toHaveTextContent("5");

    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(input).toHaveValue("4");
    expect(screen.getByTestId("committed")).toHaveTextContent("4");
  });

  it("syncs displayed value when parent programmatically resets value", () => {
    render(<ControlledNumber initial={1} min={1} />);
    const input = screen.getByLabelText("Qty");

    fireEvent.change(input, { target: { value: "10" } });
    expect(input).toHaveValue("10");

    fireEvent.click(screen.getByText("Reset"));
    expect(input).toHaveValue("1");
    expect(screen.getByTestId("committed")).toHaveTextContent("1");
  });
});

describe("OptionalNumberInput", () => {
  function ControlledOptional({
    initial = "",
    allowDecimal = false,
  }: {
    initial?: string;
    allowDecimal?: boolean;
  }) {
    const [val, setVal] = useState(initial);
    return (
      <div>
        <OptionalNumberInput
          aria-label="Measurement"
          value={val}
          onChange={setVal}
          allowDecimal={allowDecimal}
        />
        <span data-testid="committed">{val === "" ? "<empty>" : val}</span>
      </div>
    );
  }

  it("keeps empty string on blur for optional fields", () => {
    render(<ControlledOptional initial="14" />);
    const input = screen.getByLabelText("Measurement");

    fireEvent.change(input, { target: { value: "" } });
    fireEvent.blur(input);
    expect(input).toHaveValue("");
    expect(screen.getByTestId("committed")).toHaveTextContent("<empty>");
  });

  it("evaluates decimal math expressions and cleans floating-point noise", () => {
    render(<ControlledOptional initial="" allowDecimal />);
    const input = screen.getByLabelText("Measurement");

    fireEvent.change(input, { target: { value: "500/5" } });
    expect(input).toHaveValue("500/5");
    expect(screen.getByTestId("committed")).toHaveTextContent("100");
    fireEvent.blur(input);
    expect(input).toHaveValue("100");

    fireEvent.change(input, { target: { value: "16.9*6" } });
    fireEvent.blur(input);
    expect(input).toHaveValue("101.4");
    expect(screen.getByTestId("committed")).toHaveTextContent("101.4");

    fireEvent.change(input, { target: { value: "0.1+0.2" } });
    fireEvent.blur(input);
    expect(input).toHaveValue("0.3");
    expect(screen.getByTestId("committed")).toHaveTextContent("0.3");

    fireEvent.change(input, { target: { value: "100/3" } });
    fireEvent.blur(input);
    expect(input).toHaveValue("33.3333");
    expect(screen.getByTestId("committed")).toHaveTextContent("33.3333");
  });

  it("restores last valid value on invalid expression at blur", () => {
    render(<ControlledOptional initial="50" allowDecimal />);
    const input = screen.getByLabelText("Measurement");

    fireEvent.change(input, { target: { value: "500/0" } });
    fireEvent.blur(input);
    expect(input).toHaveValue("50");
    expect(screen.getByTestId("committed")).toHaveTextContent("50");
  });
});

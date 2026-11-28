import React, { useEffect, useRef, useState } from "react";

const PLAIN_NUMBER_RE = /^-?\d*\.?\d*$/;

/**
 * Strips redundant leading zeros from a plain numeric string while preserving
 * standalone "0", negative zero prefixes, and decimal values like "0.5".
 */
export function normalizeNumericString(raw: string): string {
  if (!raw) return "";
  return raw.replace(/^(-?)0+(?=\d)/, "$1");
}

/**
 * Safely evaluates a basic four-function arithmetic expression (+, -, *, /,
 * Unicode ×/÷, unary +/-, and parentheses) without using eval or Function.
 * Returns null for empty, malformed, non-finite, or divide-by-zero inputs.
 */
export function evaluateMathExpression(raw: string): number | null {
  const input = raw.trim().replace(/×/g, "*").replace(/÷/g, "/");
  if (!input) return null;

  let pos = 0;

  const skipWs = () => {
    while (pos < input.length && /\s/.test(input[pos])) {
      pos += 1;
    }
  };

  const parseExpr = (): number | null => {
    let left = parseTerm();
    if (left === null) return null;
    while (true) {
      skipWs();
      const ch = input[pos];
      if (ch !== "+" && ch !== "-") break;
      pos += 1;
      const right = parseTerm();
      if (right === null) return null;
      left = ch === "+" ? left + right : left - right;
    }
    return left;
  };

  const parseTerm = (): number | null => {
    let left = parseUnary();
    if (left === null) return null;
    while (true) {
      skipWs();
      const ch = input[pos];
      if (ch !== "*" && ch !== "/") break;
      pos += 1;
      const right = parseUnary();
      if (right === null) return null;
      if (ch === "/") {
        if (right === 0) return null;
        left = left / right;
      } else {
        left = left * right;
      }
    }
    return left;
  };

  const parseUnary = (): number | null => {
    skipWs();
    const ch = input[pos];
    if (ch === "+") {
      pos += 1;
      return parseUnary();
    }
    if (ch === "-") {
      pos += 1;
      const val = parseUnary();
      return val === null ? null : -val;
    }
    return parsePrimary();
  };

  const parsePrimary = (): number | null => {
    skipWs();
    if (pos >= input.length) return null;
    if (input[pos] === "(") {
      pos += 1;
      const inner = parseExpr();
      if (inner === null) return null;
      skipWs();
      if (input[pos] !== ")") return null;
      pos += 1;
      return inner;
    }
    const match = /^(?:\d+(?:\.\d*)?|\.\d+)/.exec(input.slice(pos));
    if (!match) return null;
    pos += match[0].length;
    const num = Number(match[0]);
    return Number.isFinite(num) ? num : null;
  };

  const result = parseExpr();
  if (result === null) return null;
  skipWs();
  if (pos !== input.length) return null;
  if (!Number.isFinite(result)) return null;
  return Object.is(result, -0) ? 0 : result;
}

function formatResolvedNumber(n: number, allowDecimal: boolean): number {
  const formatted = allowDecimal ? Number(n.toFixed(4)) : Math.round(n);
  return Object.is(formatted, -0) ? 0 : formatted;
}

function clampNumber(n: number, min?: number, max?: number): number {
  let out = n;
  if (min !== undefined && out < min) out = min;
  if (max !== undefined && out > max) out = max;
  return out;
}

export interface NumberInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "onChange" | "min" | "max"> {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  fallback?: number;
  allowDecimal?: boolean;
}

export const NumberInput: React.FC<NumberInputProps> = ({
  value,
  onChange,
  min,
  max,
  fallback,
  allowDecimal = false,
  onBlur,
  onKeyDown,
  autoComplete = "off",
  spellCheck = false,
  ...rest
}) => {
  const [draft, setDraft] = useState<string>(() => String(value));
  const lastCommittedRef = useRef<number>(value);

  useEffect(() => {
    if (value !== lastCommittedRef.current) {
      lastCommittedRef.current = value;
      setDraft(String(value));
    }
  }, [value]);

  const commitDraft = () => {
    const trimmed = draft.trim();
    const parsed = trimmed === "" ? null : evaluateMathExpression(trimmed);
    const base = parsed === null ? (fallback ?? min ?? value) : parsed;
    const next = clampNumber(formatResolvedNumber(base, allowDecimal), min, max);
    lastCommittedRef.current = next;
    setDraft(String(next));
    if (next !== value) {
      onChange(next);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    if (raw === "") {
      setDraft("");
      return;
    }

    if (PLAIN_NUMBER_RE.test(raw)) {
      const normalized = normalizeNumericString(raw);
      if (e.currentTarget.value !== normalized) {
        e.currentTarget.value = normalized;
      }
      setDraft(normalized);
      const parsed = evaluateMathExpression(normalized);
      if (parsed !== null) {
        const formatted = formatResolvedNumber(parsed, allowDecimal);
        if ((min === undefined || formatted >= min) && (max === undefined || formatted <= max)) {
          lastCommittedRef.current = formatted;
          if (formatted !== value) {
            onChange(formatted);
          }
        }
      }
      return;
    }

    setDraft(raw);
    const parsed = evaluateMathExpression(raw);
    if (parsed !== null) {
      const clamped = clampNumber(formatResolvedNumber(parsed, allowDecimal), min, max);
      lastCommittedRef.current = clamped;
      if (clamped !== value) {
        onChange(clamped);
      }
    }
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    commitDraft();
    onBlur?.(e);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      commitDraft();
    } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      const current = evaluateMathExpression(draft.trim()) ?? value;
      const delta = e.key === "ArrowUp" ? 1 : -1;
      const next = clampNumber(formatResolvedNumber(current + delta, allowDecimal), min, max);
      lastCommittedRef.current = next;
      setDraft(String(next));
      if (next !== value) {
        onChange(next);
      }
    }
    onKeyDown?.(e);
  };

  return (
    <input
      {...rest}
      type="text"
      autoComplete={autoComplete}
      spellCheck={spellCheck}
      value={draft}
      onChange={handleChange}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
    />
  );
};

export interface OptionalNumberInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "onChange" | "min" | "max"> {
  value: string;
  onChange: (value: string) => void;
  min?: number;
  max?: number;
  allowDecimal?: boolean;
}

export const OptionalNumberInput: React.FC<OptionalNumberInputProps> = ({
  value,
  onChange,
  min,
  max,
  allowDecimal = false,
  onBlur,
  onKeyDown,
  autoComplete = "off",
  spellCheck = false,
  ...rest
}) => {
  const [draft, setDraft] = useState<string>(value);
  const lastCommittedRef = useRef<string>(value);

  useEffect(() => {
    if (value !== lastCommittedRef.current) {
      lastCommittedRef.current = value;
      setDraft(value);
    }
  }, [value]);

  const commitDraft = () => {
    const trimmed = draft.trim();
    if (trimmed === "") {
      lastCommittedRef.current = "";
      setDraft("");
      if (value !== "") {
        onChange("");
      }
      return;
    }

    const parsed = evaluateMathExpression(trimmed);
    if (parsed === null) {
      const fallbackStr = value && evaluateMathExpression(value) !== null ? value : "";
      lastCommittedRef.current = fallbackStr;
      setDraft(fallbackStr);
      if (fallbackStr !== value) {
        onChange(fallbackStr);
      }
      return;
    }

    const resolved = clampNumber(formatResolvedNumber(parsed, allowDecimal), min, max);
    const resolvedStr = String(resolved);
    lastCommittedRef.current = resolvedStr;
    setDraft(resolvedStr);
    if (resolvedStr !== value) {
      onChange(resolvedStr);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    if (raw === "") {
      lastCommittedRef.current = "";
      setDraft("");
      if (value !== "") {
        onChange("");
      }
      return;
    }

    if (PLAIN_NUMBER_RE.test(raw)) {
      const normalized = normalizeNumericString(raw);
      if (e.currentTarget.value !== normalized) {
        e.currentTarget.value = normalized;
      }
      setDraft(normalized);
      const parsed = evaluateMathExpression(normalized);
      if (parsed !== null) {
        const resolved = clampNumber(formatResolvedNumber(parsed, allowDecimal), min, max);
        const resolvedStr = String(resolved);
        lastCommittedRef.current = resolvedStr;
        if (resolvedStr !== value) {
          onChange(resolvedStr);
        }
      }
      return;
    }

    setDraft(raw);
    const parsed = evaluateMathExpression(raw);
    if (parsed !== null) {
      const resolved = clampNumber(formatResolvedNumber(parsed, allowDecimal), min, max);
      const resolvedStr = String(resolved);
      lastCommittedRef.current = resolvedStr;
      if (resolvedStr !== value) {
        onChange(resolvedStr);
      }
    }
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    commitDraft();
    onBlur?.(e);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      commitDraft();
    } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      const current = evaluateMathExpression(draft.trim()) ?? 0;
      const delta = e.key === "ArrowUp" ? 1 : -1;
      const next = clampNumber(formatResolvedNumber(current + delta, allowDecimal), min, max);
      const nextStr = String(next);
      lastCommittedRef.current = nextStr;
      setDraft(nextStr);
      if (nextStr !== value) {
        onChange(nextStr);
      }
    }
    onKeyDown?.(e);
  };

  return (
    <input
      {...rest}
      type="text"
      autoComplete={autoComplete}
      spellCheck={spellCheck}
      value={draft}
      onChange={handleChange}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
    />
  );
};

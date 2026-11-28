import React, { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { OptionalNumberInput } from "./NumberInput";

export type MeasurementType = "" | "volume" | "weight" | "length";

export interface MeasurementDraft {
  type: MeasurementType;
  value: string;
  unit: string;
}

export interface HasMeasurement {
  volume_value: number | null;
  volume_unit: string | null;
  weight_value: number | null;
  weight_unit: string | null;
  length_value: number | null;
  length_unit: string | null;
}

export const EMPTY_MEASUREMENT: MeasurementDraft = { type: "", value: "", unit: "" };

export const MEASUREMENT_UNITS: Record<Exclude<MeasurementType, "">, string[]> = {
  volume: ["ml", "l", "tsp", "tbsp", "fl_oz", "cup", "pt", "qt", "gal"],
  weight: ["mg", "g", "kg", "oz", "lb", "t", "short_ton"],
  length: ["mm", "cm", "m", "km", "in", "ft", "yd", "mi"],
};

export function measurementFromEntity(entity: HasMeasurement): MeasurementDraft {
  if (entity.volume_value != null && entity.volume_unit) {
    return { type: "volume", value: String(entity.volume_value), unit: entity.volume_unit };
  }
  if (entity.weight_value != null && entity.weight_unit) {
    return { type: "weight", value: String(entity.weight_value), unit: entity.weight_unit };
  }
  if (entity.length_value != null && entity.length_unit) {
    return { type: "length", value: String(entity.length_value), unit: entity.length_unit };
  }
  return { ...EMPTY_MEASUREMENT };
}

export function measurementFromLLM(
  value?: number | null,
  unitType?: string | null,
  unit?: string | null
): MeasurementDraft {
  if (value == null || !unitType || !unit) return { ...EMPTY_MEASUREMENT };
  if (unitType !== "volume" && unitType !== "weight" && unitType !== "length") {
    return { ...EMPTY_MEASUREMENT };
  }
  if (!MEASUREMENT_UNITS[unitType].includes(unit)) {
    return { ...EMPTY_MEASUREMENT };
  }
  return { type: unitType, value: String(value), unit };
}

export function measurementToPayload(draft: MeasurementDraft) {
  const num = draft.value.trim() !== "" ? Number(draft.value) : null;
  const validNum = num != null && !Number.isNaN(num) ? num : null;
  return {
    volume_value: draft.type === "volume" && validNum != null && draft.unit ? validNum : null,
    volume_unit: draft.type === "volume" && validNum != null && draft.unit ? draft.unit : null,
    weight_value: draft.type === "weight" && validNum != null && draft.unit ? validNum : null,
    weight_unit: draft.type === "weight" && validNum != null && draft.unit ? draft.unit : null,
    length_value: draft.type === "length" && validNum != null && draft.unit ? validNum : null,
    length_unit: draft.type === "length" && validNum != null && draft.unit ? draft.unit : null,
  };
}

export function measurementToVariantWorkflowPayload(draft: MeasurementDraft) {
  const p = measurementToPayload(draft);
  return {
    variant_volume_value: p.volume_value,
    variant_volume_unit: p.volume_unit,
    variant_weight_value: p.weight_value,
    variant_weight_unit: p.weight_unit,
    variant_length_value: p.length_value,
    variant_length_unit: p.length_unit,
  };
}

export function formatMeasurement(entity: HasMeasurement | MeasurementDraft): string | null {
  if ("type" in entity) {
    if (!entity.type || entity.value.trim() === "" || !entity.unit) return null;
    return `${entity.value.trim()} ${entity.unit}`;
  }
  if (entity.volume_value != null && entity.volume_unit) return `${entity.volume_value} ${entity.volume_unit}`;
  if (entity.weight_value != null && entity.weight_unit) return `${entity.weight_value} ${entity.weight_unit}`;
  if (entity.length_value != null && entity.length_unit) return `${entity.length_value} ${entity.length_unit}`;
  return null;
}

interface MeasurementFieldsProps {
  value: MeasurementDraft;
  onChange: (next: MeasurementDraft) => void;
  label?: string;
  ariaPrefix?: string;
  defaultOpen?: boolean;
}

export const MeasurementFields: React.FC<MeasurementFieldsProps> = ({
  value,
  onChange,
  label = "Measurement (Optional)",
  ariaPrefix = "Measurement",
  defaultOpen = false,
}) => {
  const [open, setOpen] = useState(defaultOpen);
  const summary = formatMeasurement(value);

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-800/80 dark:bg-slate-950/40">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between text-left text-xs font-medium text-slate-700 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
      >
        <span className="flex items-center gap-1.5">
          {open ? <ChevronDown className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" /> : <ChevronRight className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" />}
          <span>{label}</span>
        </span>
        {summary && (
          <span className="rounded bg-indigo-50 px-2 py-0.5 text-[11px] font-normal text-indigo-800 dark:bg-slate-800 dark:text-indigo-300">
            {summary}
          </span>
        )}
      </button>

      {open && (
        <div className="mt-2.5 grid grid-cols-3 gap-2">
          <select
            aria-label={`${ariaPrefix} type`}
            value={value.type}
            onChange={(e) => {
              const nextType = e.target.value as MeasurementType;
              if (!nextType) {
                onChange({ ...EMPTY_MEASUREMENT });
              } else {
                const allowed = MEASUREMENT_UNITS[nextType];
                const nextUnit = allowed.includes(value.unit) ? value.unit : allowed[0];
                onChange({ type: nextType, value: value.value, unit: nextUnit });
              }
            }}
            className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
          >
            <option value="">None</option>
            <option value="volume">Volume</option>
            <option value="weight">Weight</option>
            <option value="length">Length</option>
          </select>

          <OptionalNumberInput
            allowDecimal
            disabled={!value.type}
            value={value.value}
            onChange={(val) => onChange({ ...value, value: val })}
            placeholder="Value"
            aria-label={`${ariaPrefix} value`}
            className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
          />

          <select
            disabled={!value.type}
            aria-label={`${ariaPrefix} unit`}
            value={value.unit}
            onChange={(e) => onChange({ ...value, unit: e.target.value })}
            className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs text-slate-900 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
          >
            <option value="">Unit</option>
            {value.type &&
              MEASUREMENT_UNITS[value.type].map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
          </select>
        </div>
      )}
    </div>
  );
};

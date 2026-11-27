import React, { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, apiFetch, Category, Location, Product, usePrintersEnabled } from "../api";
import { HierarchySelect } from "../components/HierarchySelect";
import {
  EMPTY_MEASUREMENT,
  MeasurementDraft,
  MeasurementFields,
  measurementFromEntity,
  measurementToPayload,
} from "../components/MeasurementFields";

export const ProductFormPage: React.FC = () => {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const printersEnabled = usePrintersEnabled();

  const { data: catData } = useQuery({
    queryKey: ["categories"],
    queryFn: () => apiFetch<{ categories: Category[] }>("/api/categories"),
  });
  const { data: locData } = useQuery({
    queryKey: ["locations"],
    queryFn: () => apiFetch<{ locations: Location[] }>("/api/locations"),
  });
  const { data: existing } = useQuery({
    queryKey: ["product", id],
    queryFn: () => apiFetch<{ product: Product }>(`/api/products/${id}`),
    enabled: isEdit,
  });

  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState<number>(0);
  const [locationId, setLocationId] = useState<number>(0);
  const [dueDays, setDueDays] = useState("");
  const [openDays, setOpenDays] = useState("");
  const [freezeDays, setFreezeDays] = useState("");
  const [thawDays, setThawDays] = useState("");
  const [useAvg, setUseAvg] = useState(!isEdit);
  const [minVal, setMinVal] = useState("");
  const [printMode, setPrintMode] = useState<"per_item" | "single" | "none">("per_item");
  const [measurement, setMeasurement] = useState<MeasurementDraft>(EMPTY_MEASUREMENT);
  const [error, setError] = useState<string | null>(null);
  const [conflictProduct, setConflictProduct] = useState<{ id: number; name: string } | null>(null);
  const [similarProducts, setSimilarProducts] = useState<Product[]>([]);

  useEffect(() => {
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      setSimilarProducts([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const res = await apiFetch<{ products: Product[] }>(
          `/api/products?status=all&q=${encodeURIComponent(trimmed)}`
        );
        if (!cancelled) {
          const editId = id ? Number(id) : null;
          setSimilarProducts(
            (res.products || []).filter((p) => p.id !== editId).slice(0, 5)
          );
        }
      } catch {
        if (!cancelled) setSimilarProducts([]);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [name, id]);

  useEffect(() => {
    if (existing?.product) {
      const p = existing.product;
      setName(p.name);
      setCategoryId(p.category_id);
      setLocationId(p.default_location_id);
      setDueDays(p.default_due_days != null ? String(p.default_due_days) : "");
      setOpenDays(p.default_due_days_on_open != null ? String(p.default_due_days_on_open) : "");
      setFreezeDays(p.default_due_days_on_freeze != null ? String(p.default_due_days_on_freeze) : "");
      setThawDays(p.default_due_days_on_thaw != null ? String(p.default_due_days_on_thaw) : "");
      setUseAvg(p.use_average_for_due_date);
      setMinVal(p.minimum_value != null ? String(p.minimum_value) : "");
      setPrintMode(p.label_print_mode);
      setMeasurement(measurementFromEntity(p));
    }
  }, [existing]);

  useEffect(() => {
    if (!isEdit) {
      if (!categoryId && catData?.categories?.[0]) setCategoryId(catData.categories[0].id);
      if (!locationId && locData?.locations?.[0]) setLocationId(locData.locations[0].id);
    }
  }, [isEdit, categoryId, locationId, catData, locData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setConflictProduct(null);
    const body = {
      name,
      category_id: categoryId,
      default_location_id: locationId,
      default_due_days: useAvg ? null : dueDays ? Number(dueDays) : null,
      default_due_days_on_open: openDays ? Number(openDays) : null,
      default_due_days_on_freeze: freezeDays ? Number(freezeDays) : null,
      default_due_days_on_thaw: thawDays ? Number(thawDays) : null,
      use_average_for_due_date: useAvg,
      minimum_value: minVal ? Number(minVal) : null,
      label_print_mode: printMode,
      ...measurementToPayload(measurement),
    };
    try {
      const res = await apiFetch<{ product: Product }>(isEdit ? `/api/products/${id}` : "/api/products", {
        method: isEdit ? "PATCH" : "POST",
        body: JSON.stringify(body),
      });
      void qc.invalidateQueries({ queryKey: ["products"] });
      navigate(`/products/${res.product.id}`);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409 && err.data?.existing_product) {
        const ep = err.data.existing_product as { id?: number; name?: string };
        if (typeof ep.id === "number" && typeof ep.name === "string") {
          setConflictProduct({ id: ep.id, name: ep.name });
        }
      }
      setError(err instanceof Error ? err.message : "Save failed");
    }
  };

  return (
    <form onSubmit={handleSubmit} className="mx-auto max-w-2xl space-y-5 rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
      <h2 className="text-lg font-semibold text-white">{isEdit ? "Edit Product" : "New Product"}</h2>
      {error && (
        <div role="alert" className="rounded-lg bg-rose-500/15 px-3 py-2 text-sm text-rose-200">
          <span>{error}</span>
          {conflictProduct && (
            <>
              {" "}
              <Link to={`/products/${conflictProduct.id}`} className="font-semibold underline hover:text-white">
                View {conflictProduct.name}
              </Link>
            </>
          )}
        </div>
      )}

      <div className="space-y-1.5">
        <label className="block text-xs text-slate-400">
          Product Name
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Apples, Gala or Mustard, Dijon"
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
          />
        </label>
        <p className="text-xs text-slate-500">
          Use comma-inverted format: <span className="text-slate-400">Item, Variety, Detail</span> (omit brands and category prefixes like Meat or Produce).
        </p>
        {similarProducts.length > 0 && (
          <div
            data-testid="product-form-similar-products"
            className="space-y-1 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2"
          >
            <div className="text-xs font-medium text-amber-200">Similar existing products</div>
            <ul className="space-y-1">
              {similarProducts.map((p) => {
                const isExact = p.name.trim().toLowerCase() === name.trim().toLowerCase();
                return (
                  <li key={p.id} className="flex items-center justify-between gap-2 text-xs">
                    <Link to={`/products/${p.id}`} className="font-medium text-slate-100 hover:text-indigo-300 hover:underline">
                      {p.name}
                    </Link>
                    <span className="flex items-center gap-2">
                      {isExact && (
                        <span className="rounded bg-rose-500/20 px-1.5 py-0.5 text-[11px] font-semibold text-rose-200">
                          Exact match
                        </span>
                      )}
                      <span className="text-slate-400">{p.category_name}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="block text-xs text-slate-400">
          <div className="mb-1">Category</div>
          <HierarchySelect
            items={catData?.categories || []}
            value={categoryId || null}
            onChange={(v) => setCategoryId(v || 0)}
            placeholder="Select category"
            ariaLabel="Category"
          />
        </div>
        <div className="block text-xs text-slate-400">
          <div className="mb-1">Default Location</div>
          <HierarchySelect
            items={locData?.locations || []}
            value={locationId || null}
            onChange={(v) => setLocationId(v || 0)}
            placeholder="Select location"
            ariaLabel="Default Location"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <label className="block text-xs text-slate-400">
          Due Days
          <input
            type="number"
            disabled={useAvg}
            value={useAvg ? "" : dueDays}
            placeholder={useAvg ? "Auto" : ""}
            onChange={(e) => setDueDays(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white disabled:cursor-not-allowed disabled:opacity-50"
          />
        </label>
        <label className="block text-xs text-slate-400">
          On Open (days)
          <input type="number" value={openDays} onChange={(e) => setOpenDays(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white" />
        </label>
        <label className="block text-xs text-slate-400">
          On Freeze (days)
          <input type="number" value={freezeDays} onChange={(e) => setFreezeDays(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white" />
        </label>
        <label className="block text-xs text-slate-400">
          On Thaw (days)
          <input type="number" value={thawDays} onChange={(e) => setThawDays(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white" />
        </label>
      </div>

      <div className={`grid grid-cols-1 gap-4 ${printersEnabled ? "sm:grid-cols-2" : ""}`}>
        <label className="block text-xs text-slate-400">
          Minimum Stock (Shopping List threshold)
          <input type="number" value={minVal} onChange={(e) => setMinVal(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white" />
        </label>
        {printersEnabled && (
          <label className="block text-xs text-slate-400">
            Label Print Mode
            <select value={printMode} onChange={(e) => setPrintMode(e.target.value as "per_item" | "single" | "none")} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white">
              <option value="per_item">One label per item</option>
              <option value="single">Single product label</option>
              <option value="none">No label</option>
            </select>
          </label>
        )}
      </div>

      <label className="flex items-center gap-2 text-sm text-slate-300">
        <input type="checkbox" checked={useAvg} onChange={(e) => setUseAvg(e.target.checked)} />
        Calculate due date from rolling average of recent purchases
      </label>

      <MeasurementFields value={measurement} onChange={setMeasurement} ariaPrefix="Product measurement" />

      <div className="flex justify-end gap-2">
        <button type="button" onClick={() => navigate(-1)} className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800">Cancel</button>
        <button type="submit" className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-500">Save</button>
      </div>
    </form>
  );
};

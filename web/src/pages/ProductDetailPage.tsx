import React, { useState } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, Pencil, Plus, Printer, ScanBarcode, ShoppingCart, Trash2, X } from "lucide-react";
import { apiFetch, invalidateInventoryQueries, Item, Location, Product, usePrintersEnabled, Variant } from "../api";
import { BarcodeScanModal } from "../components/BarcodeScanModal";
import { HierarchySelect } from "../components/HierarchySelect";
import { NumberInput, OptionalNumberInput } from "../components/NumberInput";
import {
  formatMeasurement,
  MEASUREMENT_UNITS,
  measurementFromEntity,
  measurementToPayload,
  MeasurementType,
} from "../components/MeasurementFields";

const LABEL_MODE_LABELS: Record<string, string> = {
  per_item: "One label per item",
  single: "Single product label",
  none: "No label",
};

export const ProductDetailPage: React.FC = () => {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const printersEnabled = usePrintersEnabled();
  const backTo = (location.state as { from?: string } | null)?.from || "/";
  const backLabel = backTo.startsWith("/search") ? "Back to search results" : "Back to inventory";

  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [bulkLocationId, setBulkLocationId] = useState<number>(0);
  const [bulkDueDate, setBulkDueDate] = useState("");
  const [bulkVariantId, setBulkVariantId] = useState("");
  const [notice, setNotice] = useState<string | null>(
    searchParams.get("notice") === "item_already_consumed" ? "The scanned item was already consumed." : null
  );
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Add Variant inline form state
  const [showAddVariant, setShowAddVariant] = useState(false);
  const [newVariantName, setNewVariantName] = useState("");
  const [newVariantMType, setNewVariantMType] = useState<MeasurementType>("");
  const [newVariantMVal, setNewVariantMVal] = useState("");
  const [newVariantMUnit, setNewVariantMUnit] = useState("");

  // Edit Variant inline state
  const [editingVariantId, setEditingVariantId] = useState<number | null>(null);
  const [editVariantName, setEditVariantName] = useState("");
  const [editVariantMType, setEditVariantMType] = useState<MeasurementType>("");
  const [editVariantMVal, setEditVariantMVal] = useState("");
  const [editVariantMUnit, setEditVariantMUnit] = useState("");

  // Per-variant Add Barcode draft state
  const [barcodeDrafts, setBarcodeDrafts] = useState<Record<number, { barcode: string; qty: number }>>({});
  const [scanModalVariantId, setScanModalVariantId] = useState<number | null>(null);

  // Per-item inline note edit state
  const [editingNoteItemId, setEditingNoteItemId] = useState<number | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [savingNote, setSavingNote] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["product", id],
    queryFn: () => apiFetch<{ product: Product; variants: Variant[]; items: Item[] }>(`/api/products/${id}`),
  });
  const { data: locData } = useQuery({
    queryKey: ["locations"],
    queryFn: () => apiFetch<{ locations: Location[] }>("/api/locations"),
  });

  const refresh = () => {
    invalidateInventoryQueries(qc);
  };

  if (isLoading || !data) {
    return <div className="py-12 text-center text-sm text-slate-600 dark:text-slate-400">Loading product...</div>;
  }

  const { product, variants, items } = data;
  const locations = locData?.locations || [];

  const getDraft = (vid: number) => barcodeDrafts[vid] || { barcode: "", qty: 1 };
  const setDraft = (vid: number, patch: Partial<{ barcode: string; qty: number }>) => {
    setBarcodeDrafts((prev) => ({
      ...prev,
      [vid]: { ...(prev[vid] || { barcode: "", qty: 1 }), ...patch },
    }));
  };

  const runBulk = async (action: string) => {
    if (selectedIds.length === 0) return;
    setErrorMsg(null);
    await apiFetch("/api/items/bulk", {
      method: "POST",
      body: JSON.stringify({
        action,
        item_ids: selectedIds,
        location_id: action === "transfer" ? bulkLocationId : undefined,
        due_on_date: action === "update_due_date" ? bulkDueDate : undefined,
        variant_id:
          action === "update_variant"
            ? bulkVariantId === "none"
              ? null
              : Number(bulkVariantId)
            : undefined,
      }),
    });
    setSelectedIds([]);
    if (action === "update_variant") setBulkVariantId("");
    setNotice(`Applied ${action} to ${selectedIds.length} item(s).`);
    refresh();
  };

  const quickAddOne = async () => {
    setErrorMsg(null);
    await apiFetch("/api/items", {
      method: "POST",
      body: JSON.stringify({ product_id: product.id, quantity: 1 }),
    });
    setNotice("Added 1 item.");
    refresh();
  };

  const handleCreateVariant = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    try {
      await apiFetch(`/api/products/${product.id}/variants`, {
        method: "POST",
        body: JSON.stringify({
          name: newVariantName.trim(),
          ...measurementToPayload({ type: newVariantMType as MeasurementType, value: newVariantMVal, unit: newVariantMUnit }),
        }),
      });
      setNewVariantName("");
      setNewVariantMType("");
      setNewVariantMVal("");
      setNewVariantMUnit("");
      setShowAddVariant(false);
      setNotice("Variant created.");
      refresh();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to create variant");
    }
  };

  const startEditVariant = (v: Variant) => {
    const m = measurementFromEntity(v);
    setEditingVariantId(v.id);
    setEditVariantName(v.name);
    setEditVariantMType(m.type);
    setEditVariantMVal(m.value);
    setEditVariantMUnit(m.unit);
    setErrorMsg(null);
  };

  const handleSaveVariant = async (variantId: number) => {
    setErrorMsg(null);
    try {
      await apiFetch(`/api/variants/${variantId}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: editVariantName.trim(),
          ...measurementToPayload({ type: editVariantMType as MeasurementType, value: editVariantMVal, unit: editVariantMUnit }),
        }),
      });
      setEditingVariantId(null);
      setNotice("Variant updated.");
      refresh();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to update variant");
    }
  };

  const handleDeleteVariant = async (variantId: number) => {
    setErrorMsg(null);
    try {
      await apiFetch(`/api/variants/${variantId}`, { method: "DELETE" });
      setNotice("Variant deleted.");
      refresh();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to delete variant");
    }
  };

  const handleAddBarcode = async (e: React.FormEvent, variantId: number) => {
    e.preventDefault();
    const draft = getDraft(variantId);
    if (!draft.barcode.trim()) return;
    setErrorMsg(null);
    try {
      await apiFetch(`/api/variants/${variantId}/barcodes`, {
        method: "POST",
        body: JSON.stringify({
          barcode: draft.barcode.trim(),
          default_quantity: draft.qty > 0 ? draft.qty : 1,
        }),
      });
      setDraft(variantId, { barcode: "", qty: 1 });
      setNotice("Barcode added.");
      refresh();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to add barcode");
    }
  };

  const handleDeleteBarcode = async (barcodeId: number) => {
    setErrorMsg(null);
    try {
      await apiFetch(`/api/barcodes/${barcodeId}`, { method: "DELETE" });
      setNotice("Barcode removed.");
      refresh();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to delete barcode");
    }
  };

  const toggleItemSelection = (itemId: number) => {
    setSelectedIds((prev) => (prev.includes(itemId) ? prev.filter((x) => x !== itemId) : [...prev, itemId]));
  };

  const startEditNote = (item: Item) => {
    setEditingNoteItemId(item.id);
    setNoteDraft(item.notes ?? "");
    setErrorMsg(null);
  };

  const cancelEditNote = () => {
    setEditingNoteItemId(null);
    setNoteDraft("");
  };

  const handleSaveNote = async (itemId: number) => {
    setSavingNote(true);
    setErrorMsg(null);
    try {
      const trimmed = noteDraft.trim();
      await apiFetch(`/api/items/${itemId}`, {
        method: "PATCH",
        body: JSON.stringify({ notes: trimmed || null }),
      });
      setEditingNoteItemId(null);
      setNoteDraft("");
      setNotice(trimmed ? "Note saved." : "Note cleared.");
      refresh();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to save note");
    } finally {
      setSavingNote(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Responsive Header: right-aligned actions stay on the same line when space permits, wrapping right-aligned when constrained */}
      <div
        data-testid="product-detail-header"
        className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 sm:flex-nowrap"
      >
        <div className="flex min-w-0 max-w-full items-center gap-3">
          <Link to={backTo} aria-label={backLabel} className="shrink-0 rounded-lg border border-slate-200 dark:border-slate-800 p-2 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="min-w-0">
            <h2 className="truncate text-lg font-bold text-slate-900 dark:text-white sm:text-xl">{product.name}</h2>
            <p className="truncate text-xs text-slate-600 dark:text-slate-400">
              {product.category_name}
              {product.next_location_name ? <> &bull; {product.next_location_name}</> : null}
            </p>
          </div>
        </div>
        <div
          data-testid="product-detail-header-actions"
          className="ml-auto flex shrink-0 items-center justify-end gap-1.5 sm:gap-2"
        >
          <button
            type="button"
            aria-label={product.manually_added_to_shopping_list ? "Remove from Shopping List" : "Add to Shopping List"}
            title={product.manually_added_to_shopping_list ? "Remove from Shopping List" : "Add to Shopping List"}
            onClick={async () => {
              await apiFetch(`/api/products/${product.id}/toggle-shopping-list`, { method: "POST" });
              refresh();
            }}
            className={`flex items-center gap-1.5 rounded-lg border p-2 text-xs font-medium sm:px-3 sm:py-2 ${
              product.manually_added_to_shopping_list
                ? "border-amber-300 dark:border-amber-500/50 bg-amber-100 dark:bg-amber-500/20 text-amber-900 dark:text-amber-200"
                : "border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700"
            }`}
          >
            <ShoppingCart className="h-4 w-4 shrink-0" />
            <span className="hidden sm:inline">{product.manually_added_to_shopping_list ? "On List" : "Add to List"}</span>
          </button>
          {printersEnabled && (
            <button
              type="button"
              aria-label="Print Product Label"
              title="Print Product Label"
              onClick={async () => {
                const res = await apiFetch<{ print_warnings?: string[] }>(`/api/products/${product.id}/print-label`, { method: "POST" });
                setNotice(res.print_warnings?.length ? `Print warning: ${res.print_warnings.join("; ")}` : "Product label sent to printer.");
              }}
              className="flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 p-2 text-xs font-medium text-slate-800 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 sm:px-3 sm:py-2"
            >
              <Printer className="h-4 w-4 shrink-0" />
              <span className="hidden sm:inline">Print Label</span>
            </button>
          )}
          <Link
            to={`/products/${product.id}/edit`}
            aria-label="Edit Product"
            title="Edit Product"
            className="flex items-center gap-1.5 rounded-lg bg-indigo-600 p-2 text-xs font-semibold text-white hover:bg-indigo-700 dark:hover:bg-indigo-500 sm:px-3 sm:py-2"
          >
            <Pencil className="h-4 w-4 shrink-0" />
            <span className="hidden sm:inline">Edit</span>
          </Link>
          <button
            type="button"
            aria-label="Delete Product"
            title="Delete Product"
            onClick={async () => {
              if (!window.confirm("Delete this product and all its items?")) return;
              await apiFetch(`/api/products/${product.id}`, { method: "DELETE" });
              qc.removeQueries({ queryKey: ["product", id] });
              invalidateInventoryQueries(qc);
              navigate("/");
            }}
            className="flex items-center gap-1.5 rounded-lg border border-rose-200 dark:border-rose-500/40 bg-rose-50 dark:bg-rose-500/15 p-2 text-xs font-medium text-rose-800 dark:text-rose-200 hover:bg-rose-100 dark:hover:bg-rose-500/25 sm:px-3 sm:py-2"
          >
            <Trash2 className="h-4 w-4 shrink-0" />
            <span className="hidden sm:inline">Delete</span>
          </button>
        </div>
      </div>

      {notice && <div className="rounded-xl border border-indigo-200 dark:border-indigo-500/40 bg-indigo-50/70 dark:bg-indigo-500/10 px-4 py-2.5 text-sm text-indigo-800 dark:text-indigo-200">{notice}</div>}
      {errorMsg && <div className="rounded-xl border border-rose-200 dark:border-rose-500/40 bg-rose-50 dark:bg-rose-500/15 px-4 py-2.5 text-sm text-rose-800 dark:text-rose-200">{errorMsg}</div>}

      {/* Metadata Summary */}
      {(() => {
        const productMeas = formatMeasurement(product);
        const tileCount = 3 + (printersEnabled ? 1 : 0) + (productMeas ? 1 : 0);
        const gridCols =
          tileCount === 5 ? "sm:grid-cols-5" : tileCount === 4 ? "sm:grid-cols-4" : "sm:grid-cols-3";
        return (
          <div className={`grid grid-cols-2 gap-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 p-4 ${gridCols}`}>
            <div><div className="text-xs text-slate-600 dark:text-slate-400">In Stock</div><div className="text-lg font-semibold text-slate-900 dark:text-white">{product.in_stock_count}</div></div>
            <div><div className="text-xs text-slate-600 dark:text-slate-400">Min Stock</div><div className="text-lg font-semibold text-slate-900 dark:text-white">{product.minimum_value ?? "—"}</div></div>
            <div>
              <div className="text-xs text-slate-600 dark:text-slate-400">Default Due Days</div>
              <div className="text-lg font-semibold text-slate-900 dark:text-white" data-testid="default-due-days-value">
                {product.use_average_for_due_date
                  ? product.calculated_due_days != null
                    ? `~${product.calculated_due_days}`
                    : "—"
                  : (product.default_due_days ?? "—")}
              </div>
            </div>
            {printersEnabled && (
              <div>
                <div className="text-xs text-slate-600 dark:text-slate-400">Label Mode</div>
                <div className="text-sm font-semibold text-slate-900 dark:text-white">
                  {LABEL_MODE_LABELS[product.label_print_mode] ?? product.label_print_mode}
                </div>
              </div>
            )}
            {productMeas && (
              <div><div className="text-xs text-slate-600 dark:text-slate-400">Measurement</div><div className="text-sm font-semibold text-slate-900 dark:text-white">{productMeas}</div></div>
            )}
          </div>
        );
      })()}

      {/* Items in Stock: Cards on mobile (md:hidden), Table on desktop (hidden md:block) */}
      <div className="space-y-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <h3 className="font-semibold text-slate-900 dark:text-white">Items in Stock ({items.length})</h3>
            {items.length > 0 && (
              <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400 md:hidden">
                <input
                  type="checkbox"
                  checked={selectedIds.length === items.length}
                  onChange={(e) => setSelectedIds(e.target.checked ? items.map((i) => i.id) : [])}
                />
                Select all
              </label>
            )}
          </div>
          <button type="button" onClick={quickAddOne} className="flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 dark:hover:bg-indigo-500">
            <Plus className="h-3.5 w-3.5" /> Quick Add Item
          </button>
        </div>

        {selectedIds.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-indigo-200 dark:border-indigo-500/30 bg-indigo-50/70 dark:bg-indigo-500/10 p-3 text-xs">
            <span className="font-semibold text-indigo-800 dark:text-indigo-200">{selectedIds.length} selected:</span>
            <button type="button" onClick={() => runBulk("consume")} className="inline-flex h-8 items-center rounded-lg bg-rose-600 px-2.5 font-medium text-white">Consume</button>
            {selectedIds.some((id) => !items.find((it) => it.id === id)?.opened_on_date) && (
              <button type="button" onClick={() => runBulk("open")} className="inline-flex h-8 items-center rounded-lg bg-amber-600 px-2.5 font-medium text-white">Open</button>
            )}
            {printersEnabled && (
              <button type="button" onClick={() => runBulk("print_label")} className="inline-flex h-8 items-center rounded-lg bg-slate-200 dark:bg-slate-700 px-2.5 font-medium text-slate-900 dark:text-white">Reprint Labels</button>
            )}
            <div className="min-w-[180px]">
              <HierarchySelect
                items={locations}
                value={bulkLocationId || null}
                onChange={(v) => setBulkLocationId(v || 0)}
                allowEmpty
                emptyLabel="Transfer to..."
                ariaLabel="Bulk transfer location"
                size="sm"
              />
            </div>
            {bulkLocationId > 0 && (
              <button type="button" onClick={() => runBulk("transfer")} className="inline-flex h-8 items-center rounded-lg bg-indigo-600 px-2.5 font-medium text-white">Move</button>
            )}
            <input
              type="date"
              aria-label="Bulk due date"
              value={bulkDueDate}
              onChange={(e) => setBulkDueDate(e.target.value)}
              className="h-8 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-0 text-slate-900 dark:text-white"
            />
            {bulkDueDate && (
              <button type="button" onClick={() => runBulk("update_due_date")} className="inline-flex h-8 items-center rounded-lg bg-emerald-600 px-2.5 font-medium text-white">Set Due</button>
            )}
            {variants.length > 0 && (
              <>
                <select
                  aria-label="Bulk variant"
                  value={bulkVariantId}
                  onChange={(e) => setBulkVariantId(e.target.value)}
                  className="h-8 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-0 text-slate-900 dark:text-white"
                >
                  <option value="">Set variant...</option>
                  <option value="none">None</option>
                  {variants.map((v) => (
                    <option key={v.id} value={String(v.id)}>{v.name}</option>
                  ))}
                </select>
                {bulkVariantId && (
                  <button type="button" onClick={() => runBulk("update_variant")} className="inline-flex h-8 items-center rounded-lg bg-indigo-600 px-2.5 font-medium text-white">
                    Set Variant
                  </button>
                )}
              </>
            )}
          </div>
        )}

        {items.length === 0 ? (
          <div className="py-4 text-center text-xs text-slate-600 dark:text-slate-400">No items currently in stock.</div>
        ) : (
          <>
            {/* Mobile stacked cards (no horizontal scroll) */}
            <div className="space-y-2.5 md:hidden" data-testid="items-mobile-list">
              {items.map((it) => {
                const checked = selectedIds.includes(it.id);
                return (
                  <div key={it.id} className="space-y-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 p-3">
                    <label className="flex items-start gap-2.5">
                      <input
                        type="checkbox"
                        checked={checked}
                        aria-label={`Select item #${it.id}`}
                        onChange={() => toggleItemSelection(it.id)}
                        className="mt-1 shrink-0"
                      />
                      <div className="min-w-0 flex-1 space-y-0.5">
                        {it.variant_name ? (
                          <>
                            <div className="break-words text-sm font-medium text-slate-900 dark:text-slate-100" data-testid={`item-variant-${it.id}`}>
                              {it.variant_name}
                            </div>
                            <div className="break-words text-xs text-slate-600 dark:text-slate-400">
                              {it.location_name || "No location"}
                            </div>
                          </>
                        ) : (
                          <div className="break-words text-sm font-medium text-slate-900 dark:text-slate-100">
                            {it.location_name || "No location"}
                          </div>
                        )}
                      </div>
                    </label>
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div>
                        <div className="text-[10px] uppercase text-slate-500">Purchased</div>
                        <div className="text-slate-700 dark:text-slate-300">{it.purchased_on_date || "—"}</div>
                      </div>
                      <div>
                        <div className="text-[10px] uppercase text-slate-500">Opened</div>
                        <div className="text-slate-700 dark:text-slate-300">{it.opened_on_date || "—"}</div>
                      </div>
                      <div>
                        <div className="text-[10px] uppercase text-slate-500">Due</div>
                        <div className="font-medium text-slate-900 dark:text-slate-100">{it.due_on_date || "—"}</div>
                      </div>
                    </div>
                    {editingNoteItemId === it.id ? (
                      <div className="space-y-2">
                        <textarea
                          rows={2}
                          value={noteDraft}
                          onChange={(e) => setNoteDraft(e.target.value)}
                          placeholder="Add a note for this item..."
                          aria-label={`Notes for item #${it.id}`}
                          className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500"
                        />
                        <div className="flex justify-end gap-1.5">
                          <button
                            type="button"
                            disabled={savingNote}
                            onClick={cancelEditNote}
                            className="rounded px-2.5 py-1 text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white disabled:opacity-50"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            disabled={savingNote}
                            onClick={() => void handleSaveNote(it.id)}
                            className="inline-flex items-center gap-1 rounded bg-indigo-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-indigo-700 dark:hover:bg-indigo-500 disabled:opacity-50"
                          >
                            <Check className="h-3 w-3" /> {savingNote ? "Saving..." : "Save"}
                          </button>
                        </div>
                      </div>
                    ) : it.notes ? (
                      <div className="flex items-start justify-between gap-2 rounded-lg bg-white dark:bg-slate-900/80 px-2.5 py-2 text-xs text-slate-700 dark:text-slate-300">
                        <p className="min-w-0 flex-1 whitespace-pre-wrap break-words">{it.notes}</p>
                        <button
                          type="button"
                          aria-label={`Edit note for item #${it.id}`}
                          title="Edit note"
                          onClick={() => startEditNote(it)}
                          className="shrink-0 rounded p-1 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        aria-label={`Add note for item #${it.id}`}
                        onClick={() => startEditNote(it)}
                        className="inline-flex items-center gap-1 text-xs text-slate-600 dark:text-slate-400 hover:text-indigo-800 dark:hover:text-indigo-300"
                      >
                        <Plus className="h-3 w-3" /> Add note
                      </button>
                    )}
                    {(() => {
                      const canOpen = !it.opened_on_date;
                      const actionCols = (canOpen ? 1 : 0) + 1 + (printersEnabled ? 1 : 0);
                      const gridColsClass = actionCols === 3 ? "grid-cols-3" : actionCols === 2 ? "grid-cols-2" : "grid-cols-1";
                      return (
                        <div className={`grid ${gridColsClass} gap-2 pt-1`}>
                          {canOpen && (
                            <button
                              type="button"
                              onClick={async () => { await apiFetch(`/api/items/${it.id}/open`, { method: "POST" }); refresh(); }}
                              className="rounded-lg bg-slate-100 dark:bg-slate-800 py-1.5 text-xs font-medium text-slate-800 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700"
                            >
                              Open
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={async () => { await apiFetch(`/api/items/${it.id}/consume`, { method: "POST" }); refresh(); }}
                            className="rounded-lg bg-rose-100 dark:bg-rose-500/20 py-1.5 text-xs font-medium text-rose-800 dark:text-rose-200 hover:bg-rose-200 dark:hover:bg-rose-500/30"
                          >
                            Consume
                          </button>
                          {printersEnabled && (
                            <button
                              type="button"
                              onClick={async () => { await apiFetch(`/api/items/${it.id}/print-label`, { method: "POST" }); setNotice(`Printed label for item #${it.id}`); }}
                              className="rounded-lg bg-slate-100 dark:bg-slate-800 py-1.5 text-xs font-medium text-slate-800 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700"
                            >
                              Print
                            </button>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                );
              })}
            </div>

            {/* Desktop table */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-slate-200 dark:border-slate-800 text-xs font-semibold uppercase text-slate-600 dark:text-slate-400">
                  <tr>
                    <th className="py-2 pr-2 font-semibold">
                      <input
                        type="checkbox"
                        checked={items.length > 0 && selectedIds.length === items.length}
                        onChange={(e) => setSelectedIds(e.target.checked ? items.map((i) => i.id) : [])}
                      />
                    </th>
                    <th className="py-2 pr-3 font-semibold">Variant</th>
                    <th className="py-2 pr-3 font-semibold">Location</th>
                    <th className="py-2 pr-3 font-semibold">Purchased</th>
                    <th className="py-2 pr-3 font-semibold">Opened</th>
                    <th className="py-2 pr-3 font-semibold">Due</th>
                    <th className="py-2 pr-3 font-semibold">Notes</th>
                    <th className="py-2 text-right font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800/70">
                  {items.map((it) => {
                    const checked = selectedIds.includes(it.id);
                    return (
                      <tr key={it.id}>
                        <td className="py-2.5 pr-2">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleItemSelection(it.id)}
                          />
                        </td>
                        <td className="py-2.5 pr-3 text-sm font-medium text-slate-900 dark:text-slate-100">
                          {it.variant_name || <span className="text-slate-500">—</span>}
                        </td>
                        <td className="py-2.5 pr-3 text-xs text-slate-600 dark:text-slate-400">{it.location_name || "—"}</td>
                        <td className="py-2.5 pr-3 text-xs text-slate-600 dark:text-slate-400">{it.purchased_on_date || "—"}</td>
                        <td className="py-2.5 pr-3 text-xs text-slate-600 dark:text-slate-400">{it.opened_on_date || "—"}</td>
                        <td className="py-2.5 pr-3 text-xs text-slate-800 dark:text-slate-200">{it.due_on_date || "—"}</td>
                        <td className="max-w-xs py-2.5 pr-3 text-xs text-slate-700 dark:text-slate-300">
                          {editingNoteItemId === it.id ? (
                            <div className="space-y-1.5">
                              <textarea
                                rows={2}
                                value={noteDraft}
                                onChange={(e) => setNoteDraft(e.target.value)}
                                placeholder="Add a note..."
                                aria-label={`Notes for item #${it.id}`}
                                className="w-full min-w-[180px] rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500"
                              />
                              <div className="flex justify-end gap-1.5">
                                <button
                                  type="button"
                                  disabled={savingNote}
                                  onClick={cancelEditNote}
                                  className="rounded px-2 py-0.5 text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white disabled:opacity-50"
                                >
                                  Cancel
                                </button>
                                <button
                                  type="button"
                                  disabled={savingNote}
                                  onClick={() => void handleSaveNote(it.id)}
                                  className="inline-flex items-center gap-1 rounded bg-indigo-600 px-2 py-0.5 text-xs font-semibold text-white hover:bg-indigo-700 dark:hover:bg-indigo-500 disabled:opacity-50"
                                >
                                  <Check className="h-3 w-3" /> {savingNote ? "Saving..." : "Save"}
                                </button>
                              </div>
                            </div>
                          ) : it.notes ? (
                            <div className="flex items-start gap-1.5">
                              <span className="min-w-0 flex-1 whitespace-pre-wrap break-words">{it.notes}</span>
                              <button
                                type="button"
                                aria-label={`Edit note for item #${it.id}`}
                                title="Edit note"
                                onClick={() => startEditNote(it)}
                                className="shrink-0 rounded p-0.5 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              aria-label={`Add note for item #${it.id}`}
                              onClick={() => startEditNote(it)}
                              className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-indigo-800 dark:hover:text-indigo-300"
                            >
                              <Plus className="h-3 w-3" /> Note
                            </button>
                          )}
                        </td>
                        <td className="whitespace-nowrap py-2.5 text-right space-x-1.5">
                          {!it.opened_on_date && (
                            <button type="button" onClick={async () => { await apiFetch(`/api/items/${it.id}/open`, { method: "POST" }); refresh(); }} className="rounded bg-slate-100 dark:bg-slate-800 px-2 py-1 text-xs hover:bg-slate-200 dark:hover:bg-slate-700">Open</button>
                          )}
                          <button type="button" onClick={async () => { await apiFetch(`/api/items/${it.id}/consume`, { method: "POST" }); refresh(); }} className="rounded bg-rose-100 dark:bg-rose-500/20 px-2 py-1 text-xs text-rose-800 dark:text-rose-200 hover:bg-rose-200 dark:hover:bg-rose-500/30">Consume</button>
                          {printersEnabled && (
                            <button type="button" onClick={async () => { await apiFetch(`/api/items/${it.id}/print-label`, { method: "POST" }); setNotice(`Printed label for item #${it.id}`); }} className="rounded bg-slate-100 dark:bg-slate-800 px-2 py-1 text-xs hover:bg-slate-200 dark:hover:bg-slate-700">Print</button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* Inline Variant & Barcode Management */}
      <div className="space-y-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 p-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-semibold text-slate-900 dark:text-white">Variants &amp; Barcodes</h3>
          <button
            type="button"
            onClick={() => setShowAddVariant((v) => !v)}
            className="flex items-center gap-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 px-2.5 py-1.5 text-xs font-medium text-slate-800 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700"
          >
            <Plus className="h-3.5 w-3.5" /> Add Variant
          </button>
        </div>

        {showAddVariant && (
          <form onSubmit={handleCreateVariant} className="space-y-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 p-3">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
              <input
                required
                value={newVariantName}
                onChange={(e) => setNewVariantName(e.target.value)}
                placeholder="Variant name (e.g. 12-pack)"
                aria-label="New variant name"
                className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-sm text-slate-900 dark:text-white sm:col-span-2"
              />
              <select
                value={newVariantMType}
                onChange={(e) => {
                  const t = e.target.value as MeasurementType;
                  setNewVariantMType(t);
                  setNewVariantMUnit(t ? MEASUREMENT_UNITS[t][0] : "");
                }}
                aria-label="New variant measurement type"
                className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-xs text-slate-900 dark:text-white"
              >
                <option value="">No measurement</option>
                <option value="volume">Volume</option>
                <option value="weight">Weight</option>
                <option value="length">Length</option>
              </select>
              {newVariantMType && (
                <div className="flex gap-1.5">
                  <OptionalNumberInput
                    allowDecimal
                    value={newVariantMVal}
                    onChange={setNewVariantMVal}
                    placeholder="Val"
                    className="w-20 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-xs text-slate-900 dark:text-white"
                  />
                  <select
                    value={newVariantMUnit}
                    onChange={(e) => setNewVariantMUnit(e.target.value)}
                    className="flex-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-xs text-slate-900 dark:text-white"
                  >
                    {MEASUREMENT_UNITS[newVariantMType].map((u) => (
                      <option key={u} value={u}>{u}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowAddVariant(false)} className="rounded-lg px-3 py-1 text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white">Cancel</button>
              <button type="submit" className="rounded-lg bg-indigo-600 px-3 py-1 text-xs font-semibold text-white hover:bg-indigo-700 dark:hover:bg-indigo-500">Save Variant</button>
            </div>
          </form>
        )}

        {variants.length === 0 ? (
          <div className="text-xs text-slate-600 dark:text-slate-400">No variants yet.</div>
        ) : (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {variants.map((v) => {
              const isEditing = editingVariantId === v.id;
              const measText = formatMeasurement(v);
              const draft = getDraft(v.id);
              return (
                <div key={v.id} className="space-y-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 p-3">
                  {isEditing ? (
                    <div className="space-y-2">
                      <input
                        value={editVariantName}
                        onChange={(e) => setEditVariantName(e.target.value)}
                        aria-label="Edit variant name"
                        className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-sm text-slate-900 dark:text-white"
                      />
                      <div className="flex flex-wrap gap-1.5">
                        <select
                          value={editVariantMType}
                          onChange={(e) => {
                            const t = e.target.value as MeasurementType;
                            setEditVariantMType(t);
                            setEditVariantMUnit(t ? MEASUREMENT_UNITS[t][0] : "");
                          }}
                          className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-xs text-slate-900 dark:text-white"
                        >
                          <option value="">No measurement</option>
                          <option value="volume">Volume</option>
                          <option value="weight">Weight</option>
                          <option value="length">Length</option>
                        </select>
                        {editVariantMType && (
                          <>
                            <OptionalNumberInput
                              allowDecimal
                              value={editVariantMVal}
                              onChange={setEditVariantMVal}
                              placeholder="Value"
                              className="w-20 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-xs text-slate-900 dark:text-white"
                            />
                            <select
                              value={editVariantMUnit}
                              onChange={(e) => setEditVariantMUnit(e.target.value)}
                              className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-xs text-slate-900 dark:text-white"
                            >
                              {MEASUREMENT_UNITS[editVariantMType].map((u) => (
                                <option key={u} value={u}>{u}</option>
                              ))}
                            </select>
                          </>
                        )}
                      </div>
                      <div className="flex justify-end gap-1.5">
                        <button type="button" onClick={() => setEditingVariantId(null)} className="rounded px-2.5 py-1 text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white">Cancel</button>
                        <button
                          type="button"
                          onClick={() => handleSaveVariant(v.id)}
                          className="flex items-center gap-1 rounded bg-indigo-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-indigo-700 dark:hover:bg-indigo-500"
                        >
                          <Check className="h-3.5 w-3.5" /> Save
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <span className="font-medium text-slate-900 dark:text-white">{v.name}</span>
                        {measText && (
                          <span className="ml-2 rounded bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 text-xs text-slate-700 dark:text-slate-300">{measText}</span>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          aria-label={`Edit variant ${v.name}`}
                          onClick={() => startEditVariant(v)}
                          className="rounded p-1 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          aria-label={`Delete variant ${v.name}`}
                          onClick={() => handleDeleteVariant(v.id)}
                          className="rounded p-1 text-slate-600 dark:text-slate-400 hover:bg-rose-50 dark:hover:bg-rose-500/20 hover:text-rose-700 dark:hover:text-rose-300"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Existing Barcodes */}
                  <div className="flex flex-wrap gap-1.5">
                    {(v.barcodes ?? []).map((b) => (
                      <span key={b.id} className="inline-flex items-center gap-1.5 rounded bg-slate-100 dark:bg-slate-800 px-2 py-0.5 font-mono text-xs text-slate-700 dark:text-slate-300">
                        <span>{b.barcode} (×{b.default_quantity})</span>
                        <button
                          type="button"
                          aria-label={`Delete barcode ${b.barcode}`}
                          onClick={() => handleDeleteBarcode(b.id)}
                          className="text-slate-600 dark:text-slate-400 hover:text-rose-700 dark:hover:text-rose-300"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>

                  {/* Inline Add Barcode row: Barcode + Scan button + Qty on one line */}
                  <form onSubmit={(e) => handleAddBarcode(e, v.id)} className="flex items-center gap-1.5">
                    <div className="relative flex flex-1 items-center">
                      <input
                        value={draft.barcode}
                        onChange={(e) => setDraft(v.id, { barcode: e.target.value })}
                        placeholder="Add barcode..."
                        aria-label={`Barcode for ${v.name}`}
                        className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 py-1.5 pl-2.5 pr-8 text-xs text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500"
                      />
                      <button
                        type="button"
                        aria-label={`Scan barcode for ${v.name}`}
                        title="Scan barcode"
                        onClick={() => setScanModalVariantId(v.id)}
                        className="absolute right-1.5 rounded p-1 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-indigo-800 dark:hover:text-indigo-300"
                      >
                        <ScanBarcode className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <NumberInput
                      min={1}
                      value={draft.qty}
                      onChange={(qty) => setDraft(v.id, { qty })}
                      aria-label={`Pack quantity for ${v.name}`}
                      title="Pack quantity"
                      className="w-16 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-center text-xs text-slate-900 dark:text-white"
                    />
                    <button
                      type="submit"
                      className="shrink-0 rounded-lg bg-slate-100 dark:bg-slate-800 px-2.5 py-1.5 text-xs font-medium text-slate-800 dark:text-slate-200 hover:bg-indigo-600 hover:text-slate-900 dark:hover:text-white"
                    >
                      Add
                    </button>
                  </form>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <BarcodeScanModal
        open={scanModalVariantId !== null}
        title="Scan Variant Barcode"
        allowQrCodes={false}
        onCapture={(code) => {
          if (scanModalVariantId !== null) {
            setDraft(scanModalVariantId, { barcode: code });
          }
        }}
        onClose={() => setScanModalVariantId(null)}
      />
    </div>
  );
};

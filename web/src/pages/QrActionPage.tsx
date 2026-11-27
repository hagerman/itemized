import React, { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowLeftRight,
  ArrowRight,
  CheckCircle2,
  ExternalLink,
  FolderOpen,
  MapPin,
  Package,
  PackageCheck,
  PackageOpen,
  Plus,
  RotateCcw,
  Search,
  ShoppingCart,
  Snowflake,
  Undo2,
} from "lucide-react";
import { apiFetch, Item, Location, Product, ScanResolution } from "../api";
import { HierarchySelect } from "../components/HierarchySelect";

interface UndoAction {
  message: string;
  itemId: number;
  patch: Record<string, string | null>;
}

function addDaysISO(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function dueBadge(dueDate: string | null): { label: string; className: string } {
  if (!dueDate) {
    return { label: "No due date", className: "bg-slate-800 text-slate-400" };
  }
  const today = todayISO();
  if (dueDate < today) {
    return { label: `Overdue (${dueDate})`, className: "bg-rose-500/20 text-rose-300 border border-rose-500/40" };
  }
  const soonCutoff = addDaysISO(7);
  if (dueDate <= soonCutoff) {
    return { label: `Due ${dueDate}`, className: "bg-amber-500/20 text-amber-200 border border-amber-500/40" };
  }
  return { label: `Due ${dueDate}`, className: "bg-slate-800 text-slate-300" };
}

export const QrActionPage: React.FC = () => {
  const { kind, id } = useParams<{ kind: string; id: string }>();
  const qc = useQueryClient();

  const normalizedKind = (kind || "").toLowerCase();
  const validKind = normalizedKind === "i" || normalizedKind === "p" || normalizedKind === "l";
  const token = (id || "").trim();

  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [undo, setUndo] = useState<UndoAction | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [transferItemId, setTransferItemId] = useState<number | null>(null);
  const [transferDestId, setTransferDestId] = useState<number | null>(null);
  const [locationFilter, setLocationFilter] = useState("");

  const {
    data: resolved,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["qr-resolve", normalizedKind, token],
    enabled: validKind && token.length > 0,
    queryFn: () =>
      apiFetch<ScanResolution>("/api/scan/resolve", {
        method: "POST",
        body: JSON.stringify({ input: `/go/${normalizedKind}/${token}` }),
      }),
  });

  const { data: locationsData } = useQuery({
    queryKey: ["locations"],
    queryFn: () => apiFetch<{ locations: Location[] }>("/api/locations"),
  });
  const allLocations = locationsData?.locations || [];

  const invalidateAll = async () => {
    await refetch();
    void qc.invalidateQueries({ queryKey: ["products"] });
    void qc.invalidateQueries({ queryKey: ["product"] });
    void qc.invalidateQueries({ queryKey: ["location"] });
  };

  const handleConsume = async (item: Item) => {
    setBusyKey(`consume-${item.id}`);
    setErrorMsg(null);
    setNotice(null);
    try {
      const res = await apiFetch<{ item: Item; already_consumed?: boolean }>(`/api/items/${item.id}/consume`, {
        method: "POST",
      });
      if (res.already_consumed) {
        setNotice(`${item.product_name} was already consumed.`);
      } else {
        setUndo({
          message: `Consumed ${item.product_name}`,
          itemId: item.id,
          patch: { consumed_on_date: null },
        });
      }
      if (transferItemId === item.id) {
        setTransferItemId(null);
        setTransferDestId(null);
      }
      await invalidateAll();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to consume item");
    } finally {
      setBusyKey(null);
    }
  };

  const handleOpen = async (item: Item) => {
    setBusyKey(`open-${item.id}`);
    setErrorMsg(null);
    setNotice(null);
    try {
      const res = await apiFetch<{ item: Item; previous: Item; print_warnings?: string[] }>(
        `/api/items/${item.id}/open`,
        { method: "POST" }
      );
      setUndo({
        message: `Opened ${item.product_name}`,
        itemId: item.id,
        patch: {
          opened_on_date: res.previous?.opened_on_date ?? null,
          due_on_date: res.previous?.due_on_date ?? null,
        },
      });
      if (res.print_warnings?.length) {
        setNotice(`Print warning: ${res.print_warnings.join("; ")}`);
      }
      await invalidateAll();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to open item");
    } finally {
      setBusyKey(null);
    }
  };

  const handleRestore = async (item: Item) => {
    setBusyKey(`restore-${item.id}`);
    setErrorMsg(null);
    setNotice(null);
    try {
      await apiFetch(`/api/items/${item.id}`, {
        method: "PATCH",
        body: JSON.stringify({ consumed_on_date: null }),
      });
      setUndo(null);
      setNotice(`Restored ${item.product_name} to in-stock.`);
      await invalidateAll();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to restore item");
    } finally {
      setBusyKey(null);
    }
  };

  const handleUndo = async () => {
    if (!undo) return;
    setBusyKey("undo");
    setErrorMsg(null);
    try {
      await apiFetch(`/api/items/${undo.itemId}`, {
        method: "PATCH",
        body: JSON.stringify(undo.patch),
      });
      setUndo(null);
      setNotice("Action undone.");
      await invalidateAll();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to undo action");
    } finally {
      setBusyKey(null);
    }
  };

  const startTransfer = (item: Item) => {
    setTransferItemId(item.id);
    setTransferDestId(item.location_id);
    setErrorMsg(null);
  };

  const handleConfirmTransfer = async (item: Item) => {
    if (!transferDestId) return;
    setBusyKey(`transfer-${item.id}`);
    setErrorMsg(null);
    setNotice(null);
    try {
      const res = await apiFetch<{ item: Item; print_warnings?: string[] }>(`/api/items/${item.id}/transfer`, {
        method: "POST",
        body: JSON.stringify({ location_id: transferDestId }),
      });
      const destName = res.item?.location_name || "new location";
      const warnSuffix = res.print_warnings?.length ? ` (Print warning: ${res.print_warnings.join("; ")})` : "";
      setNotice(`Moved ${item.product_name} to ${destName}.${warnSuffix}`);
      setTransferItemId(null);
      setTransferDestId(null);
      await invalidateAll();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to transfer item");
    } finally {
      setBusyKey(null);
    }
  };

  const handleToggleShoppingList = async (product: Product) => {
    setBusyKey(`shop-${product.id}`);
    setErrorMsg(null);
    setNotice(null);
    try {
      await apiFetch(`/api/products/${product.id}/toggle-shopping-list`, { method: "POST" });
      await invalidateAll();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to update shopping list");
    } finally {
      setBusyKey(null);
    }
  };

  const handleQuickAdd = async (product: Product) => {
    setBusyKey(`restock-${product.id}`);
    setErrorMsg(null);
    setNotice(null);
    try {
      const dueDays = product.calculated_due_days ?? product.default_due_days;
      const payload: Record<string, unknown> = {
        product_id: product.id,
        location_id: product.default_location_id,
        quantity: 1,
      };
      if (dueDays != null && dueDays > 0) {
        payload.due_on_date = addDaysISO(dueDays);
      }
      const res = await apiFetch<{ items: Item[]; print_warnings?: string[] }>("/api/items", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      const warnSuffix = res.print_warnings?.length ? ` (Print warning: ${res.print_warnings.join("; ")})` : "";
      setNotice(`Added 1 unit of ${product.name}.${warnSuffix}`);
      await invalidateAll();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to add item");
    } finally {
      setBusyKey(null);
    }
  };

  const childLocations = useMemo(() => {
    if (!resolved || resolved.kind !== "location") return [];
    return allLocations
      .filter((loc) => loc.parent_id === resolved.location.id)
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  }, [allLocations, resolved]);

  const filteredLocationItems = useMemo(() => {
    if (!resolved || resolved.kind !== "location") return [];
    const q = locationFilter.trim().toLowerCase();
    if (!q) return resolved.items;
    return resolved.items.filter(
      (it) =>
        it.product_name.toLowerCase().includes(q) ||
        (it.variant_name && it.variant_name.toLowerCase().includes(q))
    );
  }, [resolved, locationFilter]);

  if (!validKind || !token) {
    return (
      <div className="mx-auto max-w-xl py-8">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-6 text-center">
          <AlertTriangle className="mx-auto mb-3 h-10 w-10 text-amber-400" />
          <h2 className="text-lg font-bold text-white">Invalid QR link</h2>
          <p className="mt-1 text-sm text-slate-400">
            This QR link is not a recognized item, product, or location address.
          </p>
          <Link
            to="/"
            className="mt-5 inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500"
          >
            Back to Inventory
          </Link>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="mx-auto max-w-xl py-12 text-center text-sm text-slate-400">
        Loading QR quick actions...
      </div>
    );
  }

  if (isError || !resolved || resolved.kind === "unknown") {
    const entityLabel =
      normalizedKind === "i" ? "Item" : normalizedKind === "p" ? "Product" : "Location";
    return (
      <div className="mx-auto max-w-xl py-8">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-6 text-center">
          <AlertTriangle className="mx-auto mb-3 h-10 w-10 text-amber-400" />
          <h2 className="text-lg font-bold text-white">{entityLabel} not found</h2>
          <p className="mt-1 text-sm text-slate-400">
            {isError && error instanceof Error
              ? error.message
              : `We couldn't find a matching ${entityLabel.toLowerCase()} for this QR code. It may have been deleted.`}
          </p>
          <Link
            to="/"
            className="mt-5 inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500"
          >
            Back to Inventory
          </Link>
        </div>
      </div>
    );
  }

  const renderTransferPanel = (item: Item) => (
    <div className="mt-3 space-y-2.5 rounded-xl border border-indigo-500/30 bg-slate-950/80 p-3">
      <div className="text-xs font-medium text-slate-300">Move to location</div>
      <HierarchySelect
        items={allLocations}
        value={transferDestId}
        onChange={setTransferDestId}
        placeholder="Select destination location..."
        ariaLabel={`Destination location for ${item.product_name}`}
      />
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={!transferDestId || busyKey === `transfer-${item.id}`}
          onClick={() => void handleConfirmTransfer(item)}
          className="flex min-h-[40px] flex-1 items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          <ArrowLeftRight className="h-3.5 w-3.5" />
          {busyKey === `transfer-${item.id}` ? "Moving..." : "Confirm Transfer"}
        </button>
        <button
          type="button"
          onClick={() => {
            setTransferItemId(null);
            setTransferDestId(null);
          }}
          className="min-h-[40px] rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-800"
        >
          Cancel
        </button>
      </div>
    </div>
  );

  const renderBanners = () => (
    <>
      {undo && (
        <div
          role="status"
          className="flex items-center justify-between gap-3 rounded-xl border border-emerald-500/40 bg-emerald-500/15 px-4 py-3 text-sm text-emerald-100"
        >
          <span className="flex items-center gap-2 font-medium">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
            {undo.message}
          </span>
          <button
            type="button"
            disabled={busyKey === "undo"}
            onClick={() => void handleUndo()}
            className="inline-flex min-h-[36px] shrink-0 items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
          >
            <Undo2 className="h-3.5 w-3.5" /> Undo
          </button>
        </div>
      )}
      {notice && (
        <div role="status" className="rounded-xl border border-indigo-500/30 bg-indigo-500/15 px-4 py-3 text-sm text-indigo-100">
          {notice}
        </div>
      )}
      {errorMsg && (
        <div role="alert" className="rounded-xl border border-rose-500/40 bg-rose-500/15 px-4 py-3 text-sm text-rose-200">
          {errorMsg}
        </div>
      )}
    </>
  );

  // --- ITEM QR VIEW (/go/i/:id) ---
  if (resolved.kind === "item") {
    const { item, product } = resolved;
    const badge = dueBadge(item.due_on_date);
    const isConsumed = Boolean(item.consumed_on_date);
    const isOpened = Boolean(item.opened_on_date);

    return (
      <div className="mx-auto max-w-xl space-y-4">
        {renderBanners()}

        <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 shadow-lg">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-indigo-400">
                <Package className="h-3.5 w-3.5" /> Item Quick Action
              </div>
              <h2 className="mt-1 text-xl font-bold text-white">{item.product_name}</h2>
              {item.variant_name && <p className="text-sm text-slate-400">{item.variant_name}</p>}
            </div>
            <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${badge.className}`}>
              {badge.label}
            </span>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-slate-300">
            <span className="inline-flex items-center gap-1 rounded-lg bg-slate-800/80 px-2.5 py-1">
              <MapPin className="h-3.5 w-3.5 text-slate-400" />
              {item.location_name || "No location"}
            </span>
            {isOpened && (
              <span className="inline-flex items-center gap-1 rounded-lg bg-sky-500/15 px-2.5 py-1 text-sky-300">
                <PackageOpen className="h-3.5 w-3.5" />
                Opened {item.opened_on_date}
              </span>
            )}
          </div>

          {item.notes && (
            <p className="mt-3 rounded-lg bg-slate-950/60 px-3 py-2 text-xs text-slate-300">{item.notes}</p>
          )}

          {isConsumed ? (
            <div className="mt-5 space-y-3">
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
                Already consumed on <span className="font-semibold">{item.consumed_on_date}</span>.
              </div>
              <button
                type="button"
                disabled={busyKey === `restore-${item.id}`}
                onClick={() => void handleRestore(item)}
                className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
              >
                <RotateCcw className="h-4 w-4" />
                {busyKey === `restore-${item.id}` ? "Restoring..." : "Restore / Unconsume"}
              </button>
            </div>
          ) : (
            <div className="mt-5 space-y-2.5">
              <button
                type="button"
                disabled={busyKey === `consume-${item.id}`}
                onClick={() => void handleConsume(item)}
                className="flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-base font-semibold text-white shadow-sm hover:bg-emerald-500 disabled:opacity-50"
              >
                <PackageCheck className="h-5 w-5" />
                {busyKey === `consume-${item.id}` ? "Consuming..." : "Consume"}
              </button>

              <div className={`grid gap-2.5 ${isOpened ? "grid-cols-1" : "grid-cols-2"}`}>
                {!isOpened && (
                  <button
                    type="button"
                    disabled={busyKey === `open-${item.id}`}
                    onClick={() => void handleOpen(item)}
                    className="flex min-h-[46px] items-center justify-center gap-2 rounded-xl border border-sky-500/40 bg-sky-500/15 px-4 py-2.5 text-sm font-semibold text-sky-200 hover:bg-sky-500/25 disabled:opacity-50"
                  >
                    <PackageOpen className="h-4 w-4" />
                    {busyKey === `open-${item.id}` ? "Opening..." : "Open"}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() =>
                    transferItemId === item.id ? setTransferItemId(null) : startTransfer(item)
                  }
                  className="flex min-h-[46px] items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-800 px-4 py-2.5 text-sm font-semibold text-slate-100 hover:bg-slate-700"
                >
                  <ArrowLeftRight className="h-4 w-4" /> Transfer
                </button>
              </div>

              {transferItemId === item.id && renderTransferPanel(item)}
            </div>
          )}

          {product && (
            <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-slate-800 pt-4">
              <button
                type="button"
                disabled={busyKey === `shop-${product.id}`}
                onClick={() => void handleToggleShoppingList(product)}
                className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold ${
                  product.on_shopping_list
                    ? "border border-amber-500/40 bg-amber-500/15 text-amber-200 hover:bg-amber-500/25"
                    : "border border-slate-700 bg-slate-800/80 text-slate-200 hover:bg-slate-800"
                }`}
              >
                <ShoppingCart className="h-3.5 w-3.5" />
                {product.on_shopping_list ? "On Shopping List" : "Add to Shopping List"}
              </button>

              <Link
                to={`/products/${product.id}`}
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-indigo-300 hover:bg-slate-800/80 hover:text-indigo-200"
              >
                View Full Product <ExternalLink className="h-3.5 w-3.5" />
              </Link>
            </div>
          )}
        </div>
      </div>
    );
  }

  // --- PRODUCT QR VIEW (/go/p/:id) ---
  if (resolved.kind === "product") {
    const { product, items } = resolved;
    const nextItem = items[0] || null;

    return (
      <div className="mx-auto max-w-xl space-y-4">
        {renderBanners()}

        <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 shadow-lg">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-indigo-400">
                <Package className="h-3.5 w-3.5" /> Product Quick Action
              </div>
              <h2 className="mt-1 text-xl font-bold text-white">{product.name}</h2>
              {product.category_name && <p className="text-xs text-slate-400">{product.category_name}</p>}
            </div>
            <span className="shrink-0 rounded-full bg-slate-800 px-3 py-1 text-xs font-semibold text-slate-200">
              {items.length} in stock
            </span>
          </div>

          {nextItem ? (
            <div className="mt-4">
              <button
                type="button"
                disabled={busyKey === `consume-${nextItem.id}`}
                onClick={() => void handleConsume(nextItem)}
                className="flex min-h-[52px] w-full flex-col items-center justify-center rounded-xl bg-emerald-600 px-4 py-3 text-white shadow-sm hover:bg-emerald-500 disabled:opacity-50"
              >
                <span className="flex items-center gap-2 text-base font-semibold">
                  <PackageCheck className="h-5 w-5" />
                  {busyKey === `consume-${nextItem.id}` ? "Consuming..." : "Consume Next"}
                </span>
                <span className="text-xs text-emerald-100">
                  {nextItem.location_name || "No location"}
                  {nextItem.due_on_date ? ` · Due ${nextItem.due_on_date}` : ""}
                </span>
              </button>
            </div>
          ) : (
            <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/60 p-4 text-center text-sm text-slate-400">
              Out of stock — add a unit below or put this on your shopping list.
            </div>
          )}

          <div className="mt-3 grid grid-cols-2 gap-2.5">
            <button
              type="button"
              disabled={busyKey === `restock-${product.id}`}
              onClick={() => void handleQuickAdd(product)}
              className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-indigo-500/40 bg-indigo-500/15 px-3 py-2 text-sm font-semibold text-indigo-200 hover:bg-indigo-500/25 disabled:opacity-50"
            >
              <Plus className="h-4 w-4" />
              {busyKey === `restock-${product.id}` ? "Adding..." : "Quick Add (+1)"}
            </button>
            <button
              type="button"
              disabled={busyKey === `shop-${product.id}`}
              onClick={() => void handleToggleShoppingList(product)}
              className={`flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold ${
                product.on_shopping_list
                  ? "border border-amber-500/40 bg-amber-500/15 text-amber-200 hover:bg-amber-500/25"
                  : "border border-slate-700 bg-slate-800 text-slate-100 hover:bg-slate-700"
              }`}
            >
              <ShoppingCart className="h-4 w-4" />
              {product.on_shopping_list ? "On Shopping List" : "Add to Shopping List"}
            </button>
          </div>

          {items.length > 0 && (
            <div className="mt-5 space-y-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                In-stock items (soonest due first)
              </div>
              <div className="divide-y divide-slate-800 rounded-xl border border-slate-800 bg-slate-950/40">
                {items.map((it) => {
                  const badge = dueBadge(it.due_on_date);
                  return (
                    <div key={it.id} className="p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2 text-sm font-medium text-white">
                            <span>{it.location_name || "No location"}</span>
                            {it.variant_name && (
                              <span className="text-xs text-slate-400">· {it.variant_name}</span>
                            )}
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
                            <span className={`rounded-full px-2 py-0.5 ${badge.className}`}>{badge.label}</span>
                            {it.opened_on_date && (
                              <span className="rounded-full bg-sky-500/15 px-2 py-0.5 text-sky-300">
                                Opened {it.opened_on_date}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            disabled={busyKey === `consume-${it.id}`}
                            onClick={() => void handleConsume(it)}
                            className="min-h-[38px] rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
                          >
                            Consume
                          </button>
                          {!it.opened_on_date && (
                            <button
                              type="button"
                              disabled={busyKey === `open-${it.id}`}
                              onClick={() => void handleOpen(it)}
                              className="min-h-[38px] rounded-lg border border-sky-500/40 bg-sky-500/15 px-2.5 py-1.5 text-xs font-semibold text-sky-200 hover:bg-sky-500/25 disabled:opacity-50"
                            >
                              Open
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() =>
                              transferItemId === it.id ? setTransferItemId(null) : startTransfer(it)
                            }
                            className="min-h-[38px] rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-700"
                          >
                            Transfer
                          </button>
                        </div>
                      </div>
                      {transferItemId === it.id && renderTransferPanel(it)}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="mt-5 flex justify-end border-t border-slate-800 pt-4">
            <Link
              to={`/products/${product.id}`}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-indigo-300 hover:bg-slate-800/80 hover:text-indigo-200"
            >
              View Full Product <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // --- LOCATION QR VIEW (/go/l/:id) ---
  if (resolved.kind === "location") {
    const { location, items } = resolved;

    return (
      <div className="mx-auto max-w-xl space-y-4">
        {renderBanners()}

        <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 shadow-lg">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-indigo-400">
                <MapPin className="h-3.5 w-3.5" /> Location Quick Action
              </div>
              <h2 className="mt-1 text-xl font-bold text-white">{location.hierarchy_name}</h2>
              {location.is_freezer && (
                <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-sky-500/15 px-2.5 py-0.5 text-xs font-medium text-sky-300">
                  <Snowflake className="h-3 w-3" /> Freezer
                </span>
              )}
            </div>
            <span className="shrink-0 rounded-full bg-slate-800 px-3 py-1 text-xs font-semibold text-slate-200">
              {items.length} {items.length === 1 ? "item" : "items"}
            </span>
          </div>

          {childLocations.length > 0 && (
            <div className="mt-4">
              <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
                <FolderOpen className="h-3.5 w-3.5" /> Sub-locations
              </div>
              <div className="flex flex-wrap gap-2">
                {childLocations.map((child) => (
                  <Link
                    key={child.id}
                    to={`/go/l/${child.id}`}
                    className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/80 px-3 py-1.5 text-xs font-medium text-slate-100 hover:border-indigo-500/50 hover:bg-slate-800"
                  >
                    {child.is_freezer && <Snowflake className="h-3 w-3 text-sky-400" />}
                    {child.name}
                    <ArrowRight className="h-3 w-3 text-slate-400" />
                  </Link>
                ))}
              </div>
            </div>
          )}

          {items.length > 5 && (
            <div className="relative mt-4">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input
                type="search"
                value={locationFilter}
                onChange={(e) => setLocationFilter(e.target.value)}
                placeholder="Filter items in this location..."
                aria-label="Filter items in location"
                className="w-full rounded-xl border border-slate-700 bg-slate-950 py-2.5 pl-9 pr-3 text-sm text-white placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none"
              />
            </div>
          )}

          <div className="mt-4 divide-y divide-slate-800 rounded-xl border border-slate-800 bg-slate-950/40">
            {filteredLocationItems.map((it) => {
              const badge = dueBadge(it.due_on_date);
              return (
                <div key={it.id} className="p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <Link
                        to={`/go/i/${it.id}`}
                        className="block truncate text-sm font-semibold text-white hover:text-indigo-300"
                      >
                        {it.product_name}
                      </Link>
                      {it.variant_name && (
                        <div className="truncate text-xs text-slate-400">{it.variant_name}</div>
                      )}
                      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
                        <span className={`rounded-full px-2 py-0.5 ${badge.className}`}>{badge.label}</span>
                        {it.opened_on_date && (
                          <span className="rounded-full bg-sky-500/15 px-2 py-0.5 text-sky-300">
                            Opened {it.opened_on_date}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        disabled={busyKey === `consume-${it.id}`}
                        onClick={() => void handleConsume(it)}
                        className="min-h-[38px] rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
                      >
                        Consume
                      </button>
                      {!it.opened_on_date && (
                        <button
                          type="button"
                          disabled={busyKey === `open-${it.id}`}
                          onClick={() => void handleOpen(it)}
                          className="min-h-[38px] rounded-lg border border-sky-500/40 bg-sky-500/15 px-2.5 py-1.5 text-xs font-semibold text-sky-200 hover:bg-sky-500/25 disabled:opacity-50"
                        >
                          Open
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() =>
                          transferItemId === it.id ? setTransferItemId(null) : startTransfer(it)
                        }
                        className="min-h-[38px] rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-700"
                      >
                        Transfer
                      </button>
                    </div>
                  </div>
                  {transferItemId === it.id && renderTransferPanel(it)}
                </div>
              );
            })}
            {filteredLocationItems.length === 0 && (
              <div className="p-6 text-center text-xs text-slate-400">
                {items.length === 0 ? "No items stored here." : "No items match your filter."}
              </div>
            )}
          </div>

          <div className="mt-5 flex justify-end border-t border-slate-800 pt-4">
            <Link
              to={`/locations/${location.id}`}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-indigo-300 hover:bg-slate-800/80 hover:text-indigo-200"
            >
              View Full Location <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return null;
};

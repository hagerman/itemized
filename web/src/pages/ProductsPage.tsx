import React, { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowUpDown, Check, Clock, GitMerge, Plus, Search, ShoppingCart, Trash2, X } from "lucide-react";
import { apiFetch, Product } from "../api";
import { ModalBackdrop } from "../components/ModalBackdrop";

const SORT_OPTIONS = [
  { value: "name", label: "Name", selectLabel: "Sort: Name" },
  { value: "due_date", label: "Soonest Due", selectLabel: "Sort: Soonest Due" },
  { value: "stock", label: "Stock Count", selectLabel: "Sort: Stock Count" },
] as const;

export const ProductsPage: React.FC = () => {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const status = searchParams.get("status") || "in_stock";
  const categoryId = searchParams.get("category_id") || "";
  const locationId = searchParams.get("location_id") || "";
  const [q, setQ] = useState(searchParams.get("q") || "");
  const [sort, setSort] = useState(searchParams.get("sort") || "name");
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [mergeModalOpen, setMergeModalOpen] = useState(false);
  const [mergeTargetId, setMergeTargetId] = useState<number | null>(null);
  const [merging, setMerging] = useState(false);
  const [mergeError, setMergeError] = useState<string | null>(null);
  const sortMenuRef = useRef<HTMLDivElement>(null);
  const selectAllRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!sortMenuOpen) return;
    const handleMouseDown = (e: MouseEvent) => {
      if (sortMenuRef.current && !sortMenuRef.current.contains(e.target as Node)) {
        setSortMenuOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setSortMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [sortMenuOpen]);

  const queryStr = new URLSearchParams({
    status,
    ...(categoryId ? { category_id: categoryId } : {}),
    ...(locationId ? { location_id: locationId } : {}),
    ...(q.trim() ? { q: q.trim() } : {}),
    ...(sort ? { sort } : {}),
  }).toString();

  useEffect(() => {
    setSelectedIds([]);
    setBulkError(null);
    setMergeModalOpen(false);
    setMergeTargetId(null);
    setMergeError(null);
  }, [queryStr]);

  useEffect(() => {
    if (!mergeModalOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !merging) {
        e.stopPropagation();
        setMergeModalOpen(false);
        setMergeError(null);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [mergeModalOpen, merging]);

  const { data, isLoading } = useQuery({
    queryKey: ["products", queryStr],
    queryFn: () => apiFetch<{ products: Product[] }>(`/api/products?${queryStr}`),
  });

  const products = data?.products || [];
  const activeSortLabel = SORT_OPTIONS.find((opt) => opt.value === sort)?.label || "Name";
  const hasActiveFilters = Boolean(categoryId || locationId || q);

  const visibleIdSet = new Set(products.map((p) => p.id));
  const activeSelectedIds = selectedIds.filter((id) => visibleIdSet.has(id));
  const activeSelectedProducts = products.filter((p) => activeSelectedIds.includes(p.id));
  const allSelected = products.length > 0 && activeSelectedIds.length === products.length;
  const someSelected = activeSelectedIds.length > 0 && !allSelected;

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = someSelected;
    }
  }, [someSelected]);

  const clearFilters = () => {
    setSearchParams({ status });
    setQ("");
  };

  const toggleSelectProduct = (productId: number) => {
    setSelectedIds((prev) =>
      prev.includes(productId) ? prev.filter((id) => id !== productId) : [...prev, productId]
    );
  };

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds([]);
    } else {
      setSelectedIds(products.map((p) => p.id));
    }
  };

  const handleBulkDelete = async () => {
    const idsToDelete = [...activeSelectedIds];
    const count = idsToDelete.length;
    if (count === 0) return;
    if (!window.confirm(`Delete ${count} selected product${count === 1 ? "" : "s"} and all ${count === 1 ? "its" : "their"} items?`)) {
      return;
    }
    setBulkDeleting(true);
    setBulkError(null);
    try {
      const results = await Promise.allSettled(
        idsToDelete.map((id) => apiFetch(`/api/products/${id}`, { method: "DELETE" }))
      );
      const failedIds: number[] = [];
      results.forEach((res, idx) => {
        if (res.status === "rejected") {
          failedIds.push(idsToDelete[idx]);
        }
      });
      setSelectedIds(failedIds);
      if (failedIds.length > 0) {
        setBulkError(`Failed to delete ${failedIds.length} of ${idsToDelete.length} product(s).`);
      }
      void qc.invalidateQueries({ queryKey: ["products"] });
    } finally {
      setBulkDeleting(false);
    }
  };

  const openMergeModal = () => {
    if (activeSelectedProducts.length < 2) return;
    setMergeTargetId(activeSelectedProducts[0].id);
    setMergeError(null);
    setMergeModalOpen(true);
  };

  const closeMergeModal = () => {
    if (merging) return;
    setMergeModalOpen(false);
    setMergeError(null);
  };

  const handleConfirmMerge = async () => {
    if (!mergeTargetId || activeSelectedProducts.length < 2) return;
    const sourceIds = activeSelectedIds.filter((id) => id !== mergeTargetId);
    if (sourceIds.length === 0) return;
    setMerging(true);
    setMergeError(null);
    try {
      await apiFetch("/api/products/merge", {
        method: "POST",
        body: JSON.stringify({
          target_product_id: mergeTargetId,
          source_product_ids: sourceIds,
        }),
      });
      setMergeModalOpen(false);
      setMergeTargetId(null);
      setSelectedIds([]);
      void qc.invalidateQueries({ queryKey: ["products"] });
    } catch (err) {
      setMergeError(err instanceof Error ? err.message : "Failed to merge products.");
    } finally {
      setMerging(false);
    }
  };

  const handleRowClick = (e: React.MouseEvent<HTMLTableRowElement>, productId: number) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const target = e.target as HTMLElement | null;
    if (target?.closest("a, button, input, label")) return;
    navigate(`/products/${productId}`);
  };

  return (
    <div className="space-y-4">
      <div data-testid="products-toolbar" className="@container">
        <div data-testid="products-toolbar-row" className="flex flex-nowrap items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Filter products..."
              className="w-full rounded-xl border border-slate-800 bg-slate-900 py-2 pl-9 pr-3 text-sm text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
            />
          </div>

          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            aria-label="Sort products"
            className="hidden shrink-0 rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-200 @[540px]:block"
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.selectLabel}
              </option>
            ))}
          </select>

          <div ref={sortMenuRef} className="relative shrink-0 self-stretch @[540px]:hidden">
            <button
              type="button"
              onClick={() => setSortMenuOpen((open) => !open)}
              aria-label="Sort products"
              aria-haspopup="listbox"
              aria-expanded={sortMenuOpen}
              title={`Sort: ${activeSortLabel}`}
              className="flex h-full min-h-[38px] min-w-[38px] items-center justify-center rounded-xl border border-slate-800 bg-slate-900 px-2.5 text-slate-200 hover:bg-slate-800"
            >
              <ArrowUpDown className="h-4 w-4" />
            </button>
            {sortMenuOpen && (
              <div
                role="listbox"
                aria-label="Sort options"
                className="absolute right-0 z-20 mt-1.5 w-44 rounded-xl border border-slate-700 bg-slate-900 p-1 shadow-xl"
              >
                {SORT_OPTIONS.map((opt) => {
                  const active = sort === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      role="option"
                      aria-selected={active}
                      onClick={() => {
                        setSort(opt.value);
                        setSortMenuOpen(false);
                      }}
                      className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-sm transition ${
                        active
                          ? "bg-indigo-600/20 font-medium text-indigo-200"
                          : "text-slate-200 hover:bg-slate-800"
                      }`}
                    >
                      <span>{opt.label}</span>
                      {active && <Check className="h-4 w-4 text-indigo-400" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="hidden shrink-0 items-center gap-1 rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-slate-200 hover:bg-slate-700 @[640px]:flex"
            >
              <X className="h-3.5 w-3.5" /> Clear Filters
            </button>
          )}

          <Link
            to="/products/new"
            aria-label="New Product"
            title="New Product"
            className="flex min-h-[38px] min-w-[38px] shrink-0 self-stretch items-center justify-center gap-1.5 rounded-xl bg-indigo-600 px-2.5 text-sm font-semibold text-white hover:bg-indigo-500 @[540px]:min-w-0 @[540px]:self-auto @[540px]:px-3.5 @[540px]:py-2"
          >
            <Plus className="h-4 w-4 shrink-0" />
            <span className="hidden @[540px]:inline">New Product</span>
          </Link>
        </div>

        {hasActiveFilters && (
          <div className="mt-2 flex @[640px]:hidden">
            <button
              type="button"
              onClick={clearFilters}
              className="flex items-center gap-1 rounded-xl border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-700"
            >
              <X className="h-3.5 w-3.5" /> Clear Filters
            </button>
          </div>
        )}
      </div>

      {bulkError && (
        <div
          role="alert"
          className="hidden rounded-xl border border-rose-500/40 bg-rose-500/15 px-4 py-2.5 text-sm text-rose-200 md:block"
        >
          {bulkError}
        </div>
      )}

      {isLoading ? (
        <div className="py-12 text-center text-sm text-slate-400">Loading inventory...</div>
      ) : products.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-800 py-16 text-center text-sm text-slate-400">
          No products match this view.
        </div>
      ) : (
        <>
          {/* Mobile single-column card list (no selection checkboxes) */}
          <div data-testid="products-card-list" className="grid grid-cols-1 gap-3 md:hidden">
            {products.map((p) => (
              <Link
                key={p.id}
                to={`/products/${p.id}`}
                className="group flex flex-col justify-between rounded-2xl border border-slate-800 bg-slate-900/70 p-4 transition hover:border-indigo-500/60 hover:bg-slate-900"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="font-semibold text-white group-hover:text-indigo-300">{p.name}</h2>
                    <span className="shrink-0 rounded-full bg-slate-800 px-2.5 py-0.5 text-xs font-semibold text-slate-200">
                      {p.in_stock_count} in stock
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-slate-400">
                    {p.category_name}
                    {p.next_location_name ? <> &bull; {p.next_location_name}</> : null}
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  {p.overdue && (
                    <span className="inline-flex items-center gap-1 rounded-md bg-rose-500/15 px-2 py-0.5 text-xs font-medium text-rose-300">
                      <AlertTriangle className="h-3 w-3" /> Overdue ({p.next_due_on_date})
                    </span>
                  )}
                  {!p.overdue && p.due_soon && (
                    <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-300">
                      <Clock className="h-3 w-3" /> Due {p.next_due_on_date}
                    </span>
                  )}
                  {!p.overdue && !p.due_soon && p.next_due_on_date && (
                    <span className="text-xs text-slate-500">Next due: {p.next_due_on_date}</span>
                  )}
                  {p.on_shopping_list && (
                    <span className="inline-flex items-center gap-1 rounded-md bg-indigo-500/15 px-2 py-0.5 text-xs font-medium text-indigo-300">
                      <ShoppingCart className="h-3 w-3" />
                      {p.low_stock_amount ? `Need ${p.low_stock_amount}` : "Shopping List"}
                    </span>
                  )}
                </div>
              </Link>
            ))}
          </div>

          {/* Desktop compact table view with selection checkboxes */}
          <div
            data-testid="products-table"
            className="hidden overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900/60 md:block"
          >
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-800 text-xs font-semibold uppercase text-slate-400">
                <tr>
                  <th className="w-10 whitespace-nowrap py-2.5 pl-4 pr-2 font-semibold">
                    <input
                      ref={selectAllRef}
                      type="checkbox"
                      aria-label="Select all products"
                      checked={allSelected}
                      onChange={toggleSelectAll}
                      className="cursor-pointer rounded border-slate-600 bg-slate-950"
                    />
                  </th>
                  <th
                    aria-sort={sort === "name" ? "ascending" : undefined}
                    className="py-2.5 pr-3 font-semibold"
                  >
                    <button
                      type="button"
                      onClick={() => setSort("name")}
                      className={`inline-flex items-center gap-1 font-semibold uppercase transition hover:text-white ${
                        sort === "name" ? "text-indigo-300" : "text-slate-400"
                      }`}
                    >
                      <span>Product</span>
                      <ArrowUpDown className="h-3.5 w-3.5" />
                    </button>
                  </th>
                  <th className="py-2.5 pr-3 font-semibold">Category</th>
                  <th className="py-2.5 pr-3 font-semibold">Location</th>
                  <th
                    aria-sort={sort === "stock" ? "ascending" : undefined}
                    className="whitespace-nowrap py-2.5 pr-3 text-right font-semibold"
                  >
                    <button
                      type="button"
                      onClick={() => setSort("stock")}
                      className={`inline-flex items-center justify-end gap-1 font-semibold uppercase transition hover:text-white ${
                        sort === "stock" ? "text-indigo-300" : "text-slate-400"
                      }`}
                    >
                      <span>Stock</span>
                      <ArrowUpDown className="h-3.5 w-3.5" />
                    </button>
                  </th>
                  <th
                    aria-sort={sort === "due_date" ? "ascending" : undefined}
                    className="whitespace-nowrap py-2.5 pr-3 font-semibold"
                  >
                    <button
                      type="button"
                      onClick={() => setSort("due_date")}
                      className={`inline-flex items-center gap-1 font-semibold uppercase transition hover:text-white ${
                        sort === "due_date" ? "text-indigo-300" : "text-slate-400"
                      }`}
                    >
                      <span>Next Due</span>
                      <ArrowUpDown className="h-3.5 w-3.5" />
                    </button>
                  </th>
                  <th className="whitespace-nowrap py-2.5 pr-4 font-semibold">Shopping List</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70">
                {products.map((p) => {
                  const checked = activeSelectedIds.includes(p.id);
                  return (
                    <tr
                      key={p.id}
                      onClick={(e) => handleRowClick(e, p.id)}
                      className={`group cursor-pointer transition hover:bg-slate-800/50 ${
                        checked ? "bg-indigo-500/10" : ""
                      }`}
                    >
                      <td
                        className="w-10 whitespace-nowrap py-2.5 pl-4 pr-2"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          aria-label={`Select ${p.name}`}
                          onChange={() => toggleSelectProduct(p.id)}
                          className="cursor-pointer rounded border-slate-600 bg-slate-950"
                        />
                      </td>
                      <td className="py-2.5 pr-3 font-medium text-white">
                        <Link
                          to={`/products/${p.id}`}
                          className="text-white transition group-hover:text-indigo-300"
                        >
                          {p.name}
                        </Link>
                      </td>
                      <td className="py-2.5 pr-3 text-slate-300">{p.category_name}</td>
                      <td className="py-2.5 pr-3 text-slate-400">
                        {p.next_location_name || <span className="text-slate-500">—</span>}
                      </td>
                      <td className="whitespace-nowrap py-2.5 pr-3 text-right">
                        <span className="inline-block rounded-full bg-slate-800 px-2.5 py-0.5 text-xs font-semibold tabular-nums text-slate-200">
                          {p.in_stock_count}
                        </span>
                      </td>
                      <td className="whitespace-nowrap py-2.5 pr-3">
                        {p.overdue ? (
                          <span className="inline-flex items-center gap-1 rounded-md bg-rose-500/15 px-2 py-0.5 text-xs font-medium text-rose-300">
                            <AlertTriangle className="h-3 w-3" /> Overdue ({p.next_due_on_date})
                          </span>
                        ) : p.due_soon ? (
                          <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-300">
                            <Clock className="h-3 w-3" /> Due {p.next_due_on_date}
                          </span>
                        ) : p.next_due_on_date ? (
                          <span className="text-xs text-slate-400">{p.next_due_on_date}</span>
                        ) : (
                          <span className="text-slate-500">—</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap py-2.5 pr-4">
                        {p.on_shopping_list ? (
                          <span className="inline-flex items-center gap-1 rounded-md bg-indigo-500/15 px-2 py-0.5 text-xs font-medium text-indigo-300">
                            <ShoppingCart className="h-3 w-3" />
                            {p.low_stock_amount ? `Need ${p.low_stock_amount}` : "Shopping List"}
                          </span>
                        ) : (
                          <span className="text-slate-500">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {activeSelectedIds.length > 0 && (
            <div
              data-testid="products-bulk-bar"
              className="sticky bottom-4 z-20 mx-auto hidden w-fit items-center gap-3 rounded-xl border border-indigo-500/40 bg-slate-900/95 px-4 py-2.5 text-xs shadow-2xl backdrop-blur md:flex"
            >
              <span className="font-semibold text-indigo-200">{activeSelectedIds.length} selected:</span>
              {activeSelectedIds.length >= 2 && (
                <button
                  type="button"
                  disabled={bulkDeleting || merging}
                  onClick={openMergeModal}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-indigo-600 px-2.5 font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
                >
                  <GitMerge className="h-3.5 w-3.5" />
                  Merge
                </button>
              )}
              <button
                type="button"
                disabled={bulkDeleting || merging}
                onClick={() => void handleBulkDelete()}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-rose-600 px-2.5 font-medium text-white hover:bg-rose-500 disabled:opacity-50"
              >
                <Trash2 className="h-3.5 w-3.5" />
                {bulkDeleting ? "Deleting..." : "Delete"}
              </button>
            </div>
          )}

          {mergeModalOpen && activeSelectedProducts.length >= 2 && (
            <ModalBackdrop
              onClose={closeMergeModal}
              ariaLabel="Merge Products"
              className="flex items-center justify-center p-4"
            >
              <div className="w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl">
                <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
                  <div className="flex items-center gap-2">
                    <GitMerge className="h-4 w-4 text-indigo-400" />
                    <h2 className="text-base font-semibold text-white">Merge Products</h2>
                  </div>
                  <button
                    type="button"
                    aria-label="Close merge dialog"
                    disabled={merging}
                    onClick={closeMergeModal}
                    className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-white disabled:opacity-50"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="space-y-4 px-5 py-4">
                  <p className="text-sm text-slate-300">
                    Choose the destination product to keep. All variants, retail barcodes, and items from the other{" "}
                    {activeSelectedProducts.length - 1} selected product{activeSelectedProducts.length - 1 === 1 ? "" : "s"}{" "}
                    will be moved into it, and old product QR codes will redirect to it.
                  </p>

                  {mergeError && (
                    <div
                      role="alert"
                      className="rounded-xl border border-rose-500/40 bg-rose-500/15 px-3.5 py-2.5 text-sm text-rose-200"
                    >
                      {mergeError}
                    </div>
                  )}

                  <div className="max-h-64 space-y-2 overflow-y-auto" role="radiogroup" aria-label="Destination product">
                    {activeSelectedProducts.map((p) => {
                      const selected = mergeTargetId === p.id;
                      return (
                        <label
                          key={p.id}
                          className={`flex cursor-pointer items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5 transition ${
                            selected
                              ? "border-indigo-500 bg-indigo-500/15"
                              : "border-slate-800 bg-slate-950/60 hover:border-slate-700"
                          }`}
                        >
                          <div className="flex min-w-0 items-center gap-3">
                            <input
                              type="radio"
                              name="merge-destination"
                              value={p.id}
                              checked={selected}
                              disabled={merging}
                              onChange={() => setMergeTargetId(p.id)}
                              className="cursor-pointer accent-indigo-500"
                            />
                            <div className="min-w-0">
                              <div className="truncate text-sm font-medium text-white">{p.name}</div>
                              <div className="truncate text-xs text-slate-400">{p.category_name}</div>
                            </div>
                          </div>
                          <span className="shrink-0 rounded-full bg-slate-800 px-2.5 py-0.5 text-xs font-semibold tabular-nums text-slate-200">
                            {p.in_stock_count} in stock
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 border-t border-slate-800 px-5 py-3.5">
                  <button
                    type="button"
                    disabled={merging}
                    onClick={closeMergeModal}
                    className="rounded-xl border border-slate-700 bg-slate-800 px-3.5 py-2 text-sm font-medium text-slate-200 hover:bg-slate-700 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={merging || !mergeTargetId}
                    onClick={() => void handleConfirmMerge()}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50"
                  >
                    <GitMerge className="h-4 w-4" />
                    {merging ? "Merging..." : "Confirm Merge"}
                  </button>
                </div>
              </div>
            </ModalBackdrop>
          )}
        </>
      )}
    </div>
  );
};

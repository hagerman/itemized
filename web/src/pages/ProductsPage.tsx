import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowUpDown, Check, CheckCircle2, Clock, GitMerge, HelpCircle, Loader2, Plus, ScanBarcode, Search, ShieldAlert, ShoppingCart, Sparkles, Trash2, X } from "lucide-react";
import { apiFetch, AuthStatus, Category, invalidateInventoryQueries, Location, Product } from "../api";
import { useHelp } from "../components/HelpContext";
import { useScannerControl } from "../components/Layout";
import { ModalBackdrop } from "../components/ModalBackdrop";

interface ReclassifyRow {
  productId: number;
  currentName: string;
  suggestedName: string;
  newName: string;
  included: boolean;
  inStockCount: number;
  error?: string;
}

type ReclassifyPreviewAction =
  | { kind: "excluded" }
  | { kind: "invalid" }
  | { kind: "no_change" }
  | { kind: "rename" }
  | { kind: "merge_existing"; targetId: number; targetName: string }
  | { kind: "merge_survivor"; mergeCount: number; renamed: boolean }
  | { kind: "merge_batch"; targetId: number; targetName: string };

const RECLASSIFY_CHUNK_SIZE = 10;

const SORT_OPTIONS = [
  { value: "name", label: "Name", selectLabel: "Sort: Name" },
  { value: "category", label: "Category", selectLabel: "Sort: Category" },
  { value: "location", label: "Location", selectLabel: "Sort: Location" },
  { value: "stock", label: "Stock Count", selectLabel: "Sort: Stock Count" },
  { value: "due_date", label: "Soonest Due", selectLabel: "Sort: Soonest Due" },
  { value: "shopping_list", label: "Shopping List", selectLabel: "Sort: Shopping List" },
] as const;

export const ProductsPage: React.FC = () => {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { openHelpForScreen } = useHelp();
  const { openScanner } = useScannerControl();
  const [searchParams, setSearchParams] = useSearchParams();
  const [seedingStarter, setSeedingStarter] = useState(false);
  const [starterError, setStarterError] = useState<string | null>(null);
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
  const [reclassifyModalOpen, setReclassifyModalOpen] = useState(false);
  const [reclassifyLoading, setReclassifyLoading] = useState(false);
  const [reclassifyProgress, setReclassifyProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 });
  const [reclassifyRows, setReclassifyRows] = useState<ReclassifyRow[]>([]);
  const [reclassifyCatalog, setReclassifyCatalog] = useState<Product[]>([]);
  const [reclassifyApplying, setReclassifyApplying] = useState(false);
  const [reclassifyError, setReclassifyError] = useState<string | null>(null);
  const reclassifySeqRef = useRef(0);
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
    reclassifySeqRef.current += 1;
    setReclassifyModalOpen(false);
    setReclassifyLoading(false);
    setReclassifyRows([]);
    setReclassifyError(null);
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

  useEffect(() => {
    if (!reclassifyModalOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !reclassifyApplying) {
        e.stopPropagation();
        reclassifySeqRef.current += 1;
        setReclassifyModalOpen(false);
        setReclassifyLoading(false);
        setReclassifyError(null);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [reclassifyModalOpen, reclassifyApplying]);

  const { data: authStatus } = useQuery({
    queryKey: ["auth-status"],
    queryFn: () => apiFetch<AuthStatus>("/api/auth/status"),
  });
  const llmEnabled = Boolean(authStatus?.llm_enabled);

  const { data, isLoading } = useQuery({
    queryKey: ["products", queryStr],
    queryFn: () =>
      apiFetch<{ products: Product[]; status_counts?: Record<string, number> }>(`/api/products?${queryStr}`),
  });

  const { data: catData } = useQuery({
    queryKey: ["categories"],
    queryFn: () => apiFetch<{ categories: Category[] }>("/api/categories"),
  });
  const { data: locData } = useQuery({
    queryKey: ["locations"],
    queryFn: () => apiFetch<{ locations: Location[] }>("/api/locations"),
  });

  const products = data?.products || [];
  const categories = catData?.categories || [];
  const locations = locData?.locations || [];
  const activeSortLabel = SORT_OPTIONS.find((opt) => opt.value === sort)?.label || "Name";
  const hasActiveFilters = Boolean(categoryId || locationId || q);
  const isEmptyCatalog = data?.status_counts?.all === 0 && !hasActiveFilters;
  const hasTaxonomySetup = categories.length > 0 && locations.length > 0;
  const isInsecureNonLocal =
    typeof window !== "undefined" &&
    window.isSecureContext === false &&
    window.location.hostname !== "localhost" &&
    window.location.hostname !== "127.0.0.1" &&
    window.location.hostname !== "[::1]";

  const handleLoadStarterSetup = async () => {
    setSeedingStarter(true);
    setStarterError(null);
    try {
      await apiFetch("/api/onboarding/starter-taxonomy", {
        method: "POST",
        body: JSON.stringify({ categories: true, locations: true }),
      });
      void qc.invalidateQueries({ queryKey: ["categories"] });
      void qc.invalidateQueries({ queryKey: ["locations"] });
    } catch (err) {
      setStarterError(err instanceof Error ? err.message : "Failed to load starter setup");
    } finally {
      setSeedingStarter(false);
    }
  };

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
      invalidateInventoryQueries(qc);
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
      invalidateInventoryQueries(qc);
    } catch (err) {
      setMergeError(err instanceof Error ? err.message : "Failed to merge products.");
    } finally {
      setMerging(false);
    }
  };

  const closeReclassifyModal = () => {
    if (reclassifyApplying) return;
    reclassifySeqRef.current += 1;
    setReclassifyModalOpen(false);
    setReclassifyLoading(false);
    setReclassifyError(null);
  };

  const openReclassifyModal = async () => {
    if (activeSelectedProducts.length === 0 || !llmEnabled) return;
    const seq = ++reclassifySeqRef.current;
    const targetProducts = [...activeSelectedProducts];
    const byID = new Map(targetProducts.map((p) => [p.id, p]));

    setReclassifyModalOpen(true);
    setReclassifyLoading(true);
    setReclassifyError(null);
    setReclassifyRows([]);
    setReclassifyCatalog(products);
    setReclassifyProgress({ done: 0, total: targetProducts.length });

    // Load full catalog in parallel so merge previews detect unselected existing products outside current filter
    void apiFetch<{ products: Product[] }>("/api/products?status=all")
      .then((res) => {
        if (reclassifySeqRef.current === seq && res.products) {
          setReclassifyCatalog(res.products);
        }
      })
      .catch(() => {
        // Fallback to currently visible products
      });

    try {
      const collected: ReclassifyRow[] = [];
      for (let i = 0; i < targetProducts.length; i += RECLASSIFY_CHUNK_SIZE) {
        if (reclassifySeqRef.current !== seq) return;
        const chunk = targetProducts.slice(i, i + RECLASSIFY_CHUNK_SIZE);
        const res = await apiFetch<{
          suggestions: Array<{
            product_id: number;
            current_name: string;
            suggested_name: string;
            error?: string;
          }>;
        }>("/api/products/reclassify/suggest", {
          method: "POST",
          body: JSON.stringify({ product_ids: chunk.map((p) => p.id) }),
        });
        if (reclassifySeqRef.current !== seq) return;

        for (const s of res.suggestions || []) {
          const prod = byID.get(s.product_id);
          const suggested = (s.suggested_name || s.current_name || "").trim();
          const current = (s.current_name || prod?.name || "").trim();
          const changed = suggested.toLowerCase() !== current.toLowerCase();
          collected.push({
            productId: s.product_id,
            currentName: current,
            suggestedName: suggested,
            newName: suggested,
            included: changed && !s.error,
            inStockCount: prod?.in_stock_count ?? 0,
            error: s.error,
          });
        }
        setReclassifyRows([...collected]);
        setReclassifyProgress({ done: Math.min(i + chunk.length, targetProducts.length), total: targetProducts.length });
      }
    } catch (err) {
      if (reclassifySeqRef.current === seq) {
        setReclassifyError(err instanceof Error ? err.message : "Failed to generate name suggestions.");
      }
    } finally {
      if (reclassifySeqRef.current === seq) {
        setReclassifyLoading(false);
      }
    }
  };

  const reclassifyPreview = useMemo(() => {
    const actions = new Map<number, ReclassifyPreviewAction>();
    const includedRows = reclassifyRows.filter((r) => r.included);
    const includedIdSet = new Set(includedRows.map((r) => r.productId));
    const catalog = reclassifyCatalog.length > 0 ? reclassifyCatalog : products;

    const groups = new Map<string, ReclassifyRow[]>();
    for (const row of reclassifyRows) {
      if (!row.included) {
        actions.set(row.productId, { kind: "excluded" });
        continue;
      }
      const trimmed = row.newName.trim();
      if (!trimmed) {
        actions.set(row.productId, { kind: "invalid" });
        continue;
      }
      const key = trimmed.toLowerCase();
      const list = groups.get(key) || [];
      list.push(row);
      groups.set(key, list);
    }

    let renameCount = 0;
    let mergeCount = 0;
    let invalidCount = 0;

    for (const [normKey, group] of groups.entries()) {
      const unselectedMatch = catalog.find(
        (p) => !includedIdSet.has(p.id) && p.name.trim().toLowerCase() === normKey
      );
      if (unselectedMatch) {
        for (const row of group) {
          actions.set(row.productId, {
            kind: "merge_existing",
            targetId: unselectedMatch.id,
            targetName: unselectedMatch.name,
          });
          mergeCount++;
        }
        continue;
      }

      if (group.length > 1) {
        const sorted = [...group].sort((a, b) => {
          if (a.inStockCount !== b.inStockCount) return b.inStockCount - a.inStockCount;
          return a.productId - b.productId;
        });
        const survivor = sorted[0];
        const survivorRenamed = survivor.newName.trim() !== survivor.currentName.trim();
        if (survivorRenamed) renameCount++;
        actions.set(survivor.productId, {
          kind: "merge_survivor",
          mergeCount: sorted.length - 1,
          renamed: survivorRenamed,
        });
        for (const other of sorted.slice(1)) {
          actions.set(other.productId, {
            kind: "merge_batch",
            targetId: survivor.productId,
            targetName: survivor.newName.trim(),
          });
          mergeCount++;
        }
        continue;
      }

      const single = group[0];
      if (single.newName.trim() !== single.currentName.trim()) {
        actions.set(single.productId, { kind: "rename" });
        renameCount++;
      } else {
        actions.set(single.productId, { kind: "no_change" });
      }
    }

    for (const act of actions.values()) {
      if (act.kind === "invalid") invalidCount++;
    }

    return { actions, renameCount, mergeCount, invalidCount, includedCount: includedRows.length };
  }, [reclassifyRows, reclassifyCatalog, products]);

  const handleConfirmReclassify = async () => {
    const toApply = reclassifyRows
      .filter((r) => r.included)
      .map((r) => ({ product_id: r.productId, new_name: r.newName.trim() }))
      .filter((r) => r.new_name !== "");
    if (toApply.length === 0) return;
    setReclassifyApplying(true);
    setReclassifyError(null);
    try {
      await apiFetch("/api/products/reclassify/apply", {
        method: "POST",
        body: JSON.stringify({ items: toApply }),
      });
      setReclassifyModalOpen(false);
      setReclassifyRows([]);
      setSelectedIds([]);
      invalidateInventoryQueries(qc);
    } catch (err) {
      setReclassifyError(err instanceof Error ? err.message : "Failed to apply reclassification.");
    } finally {
      setReclassifyApplying(false);
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
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-600 dark:text-slate-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Filter products..."
              className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 py-2 pl-9 pr-3 text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
            />
          </div>

          <div data-testid="products-mobile-sort" className="contents md:hidden">
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value)}
              aria-label="Sort products"
              className="hidden shrink-0 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-800 dark:text-slate-200 @[540px]:block"
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
                className="flex h-full min-h-[38px] min-w-[38px] items-center justify-center rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2.5 text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <ArrowUpDown className="h-4 w-4" />
              </button>
              {sortMenuOpen && (
                <div
                  role="listbox"
                  aria-label="Sort options"
                  className="absolute right-0 z-20 mt-1.5 w-44 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-1 shadow-xl"
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
                            ? "bg-indigo-50 dark:bg-indigo-600/20 font-medium text-indigo-800 dark:text-indigo-200"
                            : "text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                        }`}
                      >
                        <span>{opt.label}</span>
                        {active && <Check className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="hidden shrink-0 items-center gap-1 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 px-3 py-2 text-xs text-slate-800 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 @[640px]:flex"
            >
              <X className="h-3.5 w-3.5" /> Clear Filters
            </button>
          )}

          <Link
            to="/products/new"
            aria-label="New Product"
            title="New Product"
            className="flex min-h-[38px] min-w-[38px] shrink-0 self-stretch items-center justify-center gap-1.5 rounded-xl bg-indigo-600 px-2.5 text-sm font-semibold text-white hover:bg-indigo-700 dark:hover:bg-indigo-500 @[540px]:min-w-0 @[540px]:self-auto @[540px]:px-3.5 @[540px]:py-2"
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
              className="flex items-center gap-1 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 px-3 py-1.5 text-xs text-slate-800 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700"
            >
              <X className="h-3.5 w-3.5" /> Clear Filters
            </button>
          </div>
        )}
      </div>

      {bulkError && (
        <div
          role="alert"
          className="hidden rounded-xl border border-rose-200 dark:border-rose-500/40 bg-rose-50 dark:bg-rose-500/15 px-4 py-2.5 text-sm text-rose-800 dark:text-rose-200 md:block"
        >
          {bulkError}
        </div>
      )}

      {isLoading ? (
        <div className="py-12 text-center text-sm text-slate-600 dark:text-slate-400">Loading inventory...</div>
      ) : products.length === 0 ? (
        isEmptyCatalog ? (
          <div
            data-testid="onboarding-card"
            className="mx-auto max-w-2xl space-y-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/80 p-6 shadow-xl"
          >
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Welcome to itemized</h2>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                Get your household inventory up and running in two quick steps.
              </p>
            </div>

            {starterError && (
              <div role="alert" className="rounded-lg border border-rose-200 dark:border-rose-500/40 bg-rose-50 dark:bg-rose-500/15 px-3 py-2 text-xs text-rose-800 dark:text-rose-200">
                {starterError}
              </div>
            )}

            <div className="space-y-3">
              <div className="flex flex-col gap-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                  {hasTaxonomySetup ? (
                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700 dark:text-emerald-400" aria-label="Completed" />
                  ) : (
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-50 dark:bg-indigo-600/20 text-xs font-semibold text-indigo-700 dark:text-indigo-300">
                      1
                    </span>
                  )}
                  <div>
                    <div className="text-sm font-medium text-slate-900 dark:text-white">Set up locations &amp; categories</div>
                    <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">
                      {hasTaxonomySetup
                        ? `${locations.length} location${locations.length === 1 ? "" : "s"} and ${categories.length} categor${categories.length === 1 ? "y" : "ies"} ready. Customize anytime in `
                        : "Load a ready-to-use grocery-store category list and household locations, or create your own in "}
                      <Link to="/locations" className="text-indigo-700 dark:text-indigo-300 hover:underline">
                        Locations
                      </Link>{" "}
                      &amp;{" "}
                      <Link to="/categories" className="text-indigo-700 dark:text-indigo-300 hover:underline">
                        Categories
                      </Link>
                      .
                    </p>
                  </div>
                </div>
                {!hasTaxonomySetup && (
                  <button
                    type="button"
                    disabled={seedingStarter}
                    onClick={() => void handleLoadStarterSetup()}
                    className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-indigo-700 dark:hover:bg-indigo-500 disabled:opacity-50"
                  >
                    {seedingStarter ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                    {seedingStarter ? "Loading..." : "Load Starter Setup"}
                  </button>
                )}
              </div>

              <div className="flex flex-col gap-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-50 dark:bg-indigo-600/20 text-xs font-semibold text-indigo-700 dark:text-indigo-300">
                    2
                  </span>
                  <div>
                    <div className="text-sm font-medium text-slate-900 dark:text-white">Add your first item</div>
                    <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">
                      Scan a retail barcode with Purchase mode or create a product manually. You can also create new categories and locations inline as you go.
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => openScanner("purchase")}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-700 dark:hover:bg-indigo-500"
                  >
                    <ScanBarcode className="h-3.5 w-3.5" /> Scan / Action
                  </button>
                  <Link
                    to="/products/new"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-800 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700"
                  >
                    <Plus className="h-3.5 w-3.5" /> New Product
                  </Link>
                </div>
              </div>
            </div>

            {isInsecureNonLocal && (
              <div
                data-testid="onboarding-https-warning"
                className="flex items-start gap-2.5 rounded-xl border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 px-3.5 py-3 text-xs text-amber-900 dark:text-amber-200"
              >
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-800 dark:text-amber-300" />
                <div>
                  <span className="font-semibold">Camera scanning requires HTTPS on mobile browsers.</span>{" "}
                  You are currently viewing itemized over plain HTTP. Serve it behind a reverse proxy with TLS to use phone camera scanning.{" "}
                  <Link to="/help/use/barcode-scanning" className="font-semibold underline hover:text-slate-900 dark:hover:text-white">
                    Learn how to set up HTTPS
                  </Link>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 py-16 text-center text-sm text-slate-600 dark:text-slate-400">
            No products match this view.
          </div>
        )
      ) : (
        <>
          {/* Mobile single-column card list (no selection checkboxes) */}
          <div data-testid="products-card-list" className="grid grid-cols-1 gap-3 md:hidden">
            {products.map((p) => (
              <Link
                key={p.id}
                to={`/products/${p.id}`}
                className="group flex flex-col justify-between rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/70 p-4 transition hover:border-indigo-500/60 hover:bg-slate-100 dark:hover:bg-slate-900"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="font-semibold text-slate-900 dark:text-white group-hover:text-indigo-700 dark:group-hover:text-indigo-300">{p.name}</h2>
                    <span className="shrink-0 rounded-full bg-slate-100 dark:bg-slate-800 px-2.5 py-0.5 text-xs font-semibold text-slate-800 dark:text-slate-200">
                      {p.in_stock_count} in stock
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                    {p.category_name}
                    {p.next_location_name ? <> &bull; {p.next_location_name}</> : null}
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  {p.overdue && (
                    <span className="inline-flex items-center gap-1 rounded-md bg-rose-50 dark:bg-rose-500/15 px-2 py-0.5 text-xs font-medium text-rose-700 dark:text-rose-300">
                      <AlertTriangle className="h-3 w-3" /> Overdue ({p.next_due_on_date})
                    </span>
                  )}
                  {!p.overdue && p.due_soon && (
                    <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 dark:bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-800 dark:text-amber-300">
                      <Clock className="h-3 w-3" /> Due {p.next_due_on_date}
                    </span>
                  )}
                  {!p.overdue && !p.due_soon && p.next_due_on_date && (
                    <span className="text-xs text-slate-500">Next due: {p.next_due_on_date}</span>
                  )}
                  {p.on_shopping_list && (
                    <span className="inline-flex items-center gap-1 rounded-md bg-indigo-50 dark:bg-indigo-500/15 px-2 py-0.5 text-xs font-medium text-indigo-700 dark:text-indigo-300">
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
            className="hidden overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 md:block"
          >
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 dark:border-slate-800 text-xs font-semibold uppercase text-slate-600 dark:text-slate-400">
                <tr>
                  <th className="w-10 whitespace-nowrap py-2.5 pl-4 pr-2 font-semibold">
                    <input
                      ref={selectAllRef}
                      type="checkbox"
                      aria-label="Select all products"
                      checked={allSelected}
                      onChange={toggleSelectAll}
                      className="cursor-pointer rounded border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-950"
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
                        sort === "name" ? "text-indigo-700 dark:text-indigo-300" : "text-slate-600 dark:text-slate-400"
                      }`}
                    >
                      <span>Product</span>
                      <ArrowUpDown className="h-3.5 w-3.5" />
                    </button>
                  </th>
                  <th
                    aria-sort={sort === "category" ? "ascending" : undefined}
                    className="py-2.5 pr-3 font-semibold"
                  >
                    <button
                      type="button"
                      onClick={() => setSort("category")}
                      className={`inline-flex items-center gap-1 font-semibold uppercase transition hover:text-white ${
                        sort === "category" ? "text-indigo-700 dark:text-indigo-300" : "text-slate-600 dark:text-slate-400"
                      }`}
                    >
                      <span>Category</span>
                      <ArrowUpDown className="h-3.5 w-3.5" />
                    </button>
                  </th>
                  <th
                    aria-sort={sort === "location" ? "ascending" : undefined}
                    className="py-2.5 pr-3 font-semibold"
                  >
                    <button
                      type="button"
                      onClick={() => setSort("location")}
                      className={`inline-flex items-center gap-1 font-semibold uppercase transition hover:text-white ${
                        sort === "location" ? "text-indigo-700 dark:text-indigo-300" : "text-slate-600 dark:text-slate-400"
                      }`}
                    >
                      <span>Location</span>
                      <ArrowUpDown className="h-3.5 w-3.5" />
                    </button>
                  </th>
                  <th
                    aria-sort={sort === "stock" ? "descending" : undefined}
                    className="whitespace-nowrap py-2.5 pr-3 text-right font-semibold"
                  >
                    <button
                      type="button"
                      onClick={() => setSort("stock")}
                      className={`inline-flex items-center justify-end gap-1 font-semibold uppercase transition hover:text-white ${
                        sort === "stock" ? "text-indigo-700 dark:text-indigo-300" : "text-slate-600 dark:text-slate-400"
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
                        sort === "due_date" ? "text-indigo-700 dark:text-indigo-300" : "text-slate-600 dark:text-slate-400"
                      }`}
                    >
                      <span>Next Due</span>
                      <ArrowUpDown className="h-3.5 w-3.5" />
                    </button>
                  </th>
                  <th
                    aria-sort={sort === "shopping_list" ? "descending" : undefined}
                    className="whitespace-nowrap py-2.5 pr-4 font-semibold"
                  >
                    <button
                      type="button"
                      onClick={() => setSort("shopping_list")}
                      className={`inline-flex items-center gap-1 font-semibold uppercase transition hover:text-white ${
                        sort === "shopping_list" ? "text-indigo-700 dark:text-indigo-300" : "text-slate-600 dark:text-slate-400"
                      }`}
                    >
                      <span>Shopping List</span>
                      <ArrowUpDown className="h-3.5 w-3.5" />
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800/70">
                {products.map((p) => {
                  const checked = activeSelectedIds.includes(p.id);
                  return (
                    <tr
                      key={p.id}
                      onClick={(e) => handleRowClick(e, p.id)}
                      className={`group cursor-pointer transition hover:bg-slate-50 dark:hover:bg-slate-800/50 ${
                        checked ? "bg-indigo-50/70 dark:bg-indigo-500/10" : ""
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
                          className="cursor-pointer rounded border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-950"
                        />
                      </td>
                      <td className="py-2.5 pr-3 font-medium text-slate-900 dark:text-white">
                        <Link
                          to={`/products/${p.id}`}
                          className="text-slate-900 dark:text-white transition group-hover:text-indigo-700 dark:group-hover:text-indigo-300"
                        >
                          {p.name}
                        </Link>
                      </td>
                      <td className="py-2.5 pr-3 text-slate-700 dark:text-slate-300">{p.category_name}</td>
                      <td className="py-2.5 pr-3 text-slate-600 dark:text-slate-400">
                        {p.next_location_name || <span className="text-slate-500">—</span>}
                      </td>
                      <td className="whitespace-nowrap py-2.5 pr-3 text-right">
                        <span className="inline-block rounded-full bg-slate-100 dark:bg-slate-800 px-2.5 py-0.5 text-xs font-semibold tabular-nums text-slate-800 dark:text-slate-200">
                          {p.in_stock_count}
                        </span>
                      </td>
                      <td className="whitespace-nowrap py-2.5 pr-3">
                        {p.overdue ? (
                          <span className="inline-flex items-center gap-1 rounded-md bg-rose-50 dark:bg-rose-500/15 px-2 py-0.5 text-xs font-medium text-rose-700 dark:text-rose-300">
                            <AlertTriangle className="h-3 w-3" /> Overdue ({p.next_due_on_date})
                          </span>
                        ) : p.due_soon ? (
                          <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 dark:bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-800 dark:text-amber-300">
                            <Clock className="h-3 w-3" /> Due {p.next_due_on_date}
                          </span>
                        ) : p.next_due_on_date ? (
                          <span className="text-xs text-slate-600 dark:text-slate-400">{p.next_due_on_date}</span>
                        ) : (
                          <span className="text-slate-500">—</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap py-2.5 pr-4">
                        {p.on_shopping_list ? (
                          <span className="inline-flex items-center gap-1 rounded-md bg-indigo-50 dark:bg-indigo-500/15 px-2 py-0.5 text-xs font-medium text-indigo-700 dark:text-indigo-300">
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
              className="sticky bottom-4 z-20 mx-auto hidden w-fit items-center gap-3 rounded-xl border border-indigo-200 dark:border-indigo-500/40 bg-white/95 dark:bg-slate-900/95 px-4 py-2.5 text-xs shadow-2xl backdrop-blur md:flex"
            >
              <span className="font-semibold text-indigo-800 dark:text-indigo-200">{activeSelectedIds.length} selected:</span>
              {llmEnabled && (
                <button
                  type="button"
                  disabled={bulkDeleting || merging || reclassifyApplying}
                  onClick={() => void openReclassifyModal()}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-amber-600 px-2.5 font-medium text-white hover:bg-amber-500 disabled:opacity-50"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  Reclassify
                </button>
              )}
              {activeSelectedIds.length >= 2 && (
                <button
                  type="button"
                  disabled={bulkDeleting || merging || reclassifyApplying}
                  onClick={openMergeModal}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-indigo-600 px-2.5 font-medium text-white hover:bg-indigo-700 dark:hover:bg-indigo-500 disabled:opacity-50"
                >
                  <GitMerge className="h-3.5 w-3.5" />
                  Merge
                </button>
              )}
              <button
                type="button"
                disabled={bulkDeleting || merging || reclassifyApplying}
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
              <div className="w-full max-w-lg rounded-2xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl">
                <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 px-5 py-4">
                  <div className="flex items-center gap-2">
                    <GitMerge className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                    <h2 className="text-base font-semibold text-slate-900 dark:text-white">Merge Products</h2>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => openHelpForScreen("dialog/merge-products")}
                      aria-label="Help for Merge Products"
                      className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-indigo-700 dark:text-indigo-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-indigo-800 dark:hover:text-indigo-200"
                    >
                      <HelpCircle className="h-4 w-4" /> Help
                    </button>
                    <button
                      type="button"
                      aria-label="Close merge dialog"
                      disabled={merging}
                      onClick={closeMergeModal}
                      className="rounded-lg p-1 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white disabled:opacity-50"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <div className="space-y-4 px-5 py-4">
                  <p className="text-sm text-slate-700 dark:text-slate-300">
                    Choose the destination product to keep. All variants, retail barcodes, and items from the other{" "}
                    {activeSelectedProducts.length - 1} selected product{activeSelectedProducts.length - 1 === 1 ? "" : "s"}{" "}
                    will be moved into it, and old product QR codes will redirect to it.
                  </p>

                  {mergeError && (
                    <div
                      role="alert"
                      className="rounded-xl border border-rose-200 dark:border-rose-500/40 bg-rose-50 dark:bg-rose-500/15 px-3.5 py-2.5 text-sm text-rose-800 dark:text-rose-200"
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
                              ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-500/15"
                              : "border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 hover:border-slate-300 dark:hover:border-slate-700"
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
                              <div className="truncate text-sm font-medium text-slate-900 dark:text-white">{p.name}</div>
                              <div className="truncate text-xs text-slate-600 dark:text-slate-400">{p.category_name}</div>
                            </div>
                          </div>
                          <span className="shrink-0 rounded-full bg-slate-100 dark:bg-slate-800 px-2.5 py-0.5 text-xs font-semibold tabular-nums text-slate-800 dark:text-slate-200">
                            {p.in_stock_count} in stock
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 border-t border-slate-200 dark:border-slate-800 px-5 py-3.5">
                  <button
                    type="button"
                    disabled={merging}
                    onClick={closeMergeModal}
                    className="rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 px-3.5 py-2 text-sm font-medium text-slate-800 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={merging || !mergeTargetId}
                    onClick={() => void handleConfirmMerge()}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 dark:hover:bg-indigo-500 disabled:opacity-50"
                  >
                    <GitMerge className="h-4 w-4" />
                    {merging ? "Merging..." : "Confirm Merge"}
                  </button>
                </div>
              </div>
            </ModalBackdrop>
          )}

          {reclassifyModalOpen && (
            <ModalBackdrop
              onClose={closeReclassifyModal}
              ariaLabel="Reclassify Products"
              className="flex items-center justify-center p-4"
            >
              <div className="flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl">
                <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 px-5 py-4">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-amber-700 dark:text-amber-400" />
                    <h2 className="text-base font-semibold text-slate-900 dark:text-white">Reclassify Products</h2>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => openHelpForScreen("dialog/reclassify-products")}
                      aria-label="Help for Reclassify Products"
                      className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-indigo-700 dark:text-indigo-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-indigo-800 dark:hover:text-indigo-200"
                    >
                      <HelpCircle className="h-4 w-4" /> Help
                    </button>
                    <button
                      type="button"
                      aria-label="Close reclassify dialog"
                      disabled={reclassifyApplying}
                      onClick={closeReclassifyModal}
                      className="rounded-lg p-1 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white disabled:opacity-50"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
                  <p className="text-sm text-slate-700 dark:text-slate-300">
                    Review standardized names below. Tweak any name or uncheck rows to exclude them. Products resolving to the same name (or matching an existing product) will be merged automatically.
                  </p>

                  {reclassifyLoading && (
                    <div
                      role="status"
                      className="flex items-center gap-2 rounded-xl border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 px-3.5 py-2.5 text-sm text-amber-900 dark:text-amber-200"
                    >
                      <Loader2 className="h-4 w-4 animate-spin text-amber-700 dark:text-amber-400" />
                      <span>
                        Classifying {reclassifyProgress.done} / {reclassifyProgress.total} products...
                      </span>
                    </div>
                  )}

                  {reclassifyError && (
                    <div
                      role="alert"
                      className="rounded-xl border border-rose-200 dark:border-rose-500/40 bg-rose-50 dark:bg-rose-500/15 px-3.5 py-2.5 text-sm text-rose-800 dark:text-rose-200"
                    >
                      {reclassifyError}
                    </div>
                  )}

                  {reclassifyRows.length > 0 && (
                    <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
                      <table className="w-full text-left text-sm">
                        <thead className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 text-xs font-semibold uppercase text-slate-600 dark:text-slate-400">
                          <tr>
                            <th className="w-10 py-2.5 pl-3 pr-2">Use</th>
                            <th className="py-2.5 pr-3">Current Name</th>
                            <th className="py-2.5 pr-3">New Name</th>
                            <th className="py-2.5 pr-3">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 dark:divide-slate-800/70">
                          {reclassifyRows.map((row) => {
                            const action = reclassifyPreview.actions.get(row.productId) || { kind: "excluded" };
                            return (
                              <tr key={row.productId} className={row.included ? "" : "opacity-60"}>
                                <td className="py-2.5 pl-3 pr-2">
                                  <input
                                    type="checkbox"
                                    checked={row.included}
                                    disabled={reclassifyApplying}
                                    aria-label={`Include ${row.currentName}`}
                                    onChange={(e) => {
                                      const checked = e.target.checked;
                                      setReclassifyRows((prev) =>
                                        prev.map((r) =>
                                          r.productId === row.productId ? { ...r, included: checked } : r
                                        )
                                      );
                                    }}
                                    className="cursor-pointer rounded border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-950"
                                  />
                                </td>
                                <td className="py-2.5 pr-3 text-slate-700 dark:text-slate-300">
                                  <div>{row.currentName}</div>
                                  {row.error && (
                                    <div className="text-xs text-amber-800 dark:text-amber-300">{row.error}</div>
                                  )}
                                </td>
                                <td className="py-2.5 pr-3">
                                  <input
                                    type="text"
                                    value={row.newName}
                                    disabled={reclassifyApplying}
                                    aria-label={`New name for ${row.currentName}`}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      setReclassifyRows((prev) =>
                                        prev.map((r) =>
                                          r.productId === row.productId
                                            ? { ...r, newName: val, included: true }
                                            : r
                                        )
                                      );
                                    }}
                                    className="w-full min-w-[180px] rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1.5 text-sm text-slate-900 dark:text-white focus:border-indigo-500 focus:outline-none"
                                  />
                                </td>
                                <td className="whitespace-nowrap py-2.5 pr-3 text-xs">
                                  {action.kind === "rename" && (
                                    <span className="inline-flex rounded-md bg-indigo-50 dark:bg-indigo-500/15 px-2 py-0.5 font-medium text-indigo-700 dark:text-indigo-300">
                                      Rename
                                    </span>
                                  )}
                                  {action.kind === "merge_existing" && (
                                    <span className="inline-flex rounded-md bg-amber-50 dark:bg-amber-500/15 px-2 py-0.5 font-medium text-amber-900 dark:text-amber-200">
                                      Merge into existing: {action.targetName}
                                    </span>
                                  )}
                                  {action.kind === "merge_survivor" && (
                                    <span className="inline-flex rounded-md bg-amber-50 dark:bg-amber-500/15 px-2 py-0.5 font-medium text-amber-900 dark:text-amber-200">
                                      {action.renamed ? "Rename" : "Keep"} &amp; merge (+{action.mergeCount})
                                    </span>
                                  )}
                                  {action.kind === "merge_batch" && (
                                    <span className="inline-flex rounded-md bg-amber-50 dark:bg-amber-500/15 px-2 py-0.5 font-medium text-amber-900 dark:text-amber-200">
                                      Merge into {action.targetName}
                                    </span>
                                  )}
                                  {action.kind === "no_change" && (
                                    <span className="text-slate-600 dark:text-slate-400">No change</span>
                                  )}
                                  {action.kind === "excluded" && (
                                    <span className="text-slate-500">Excluded</span>
                                  )}
                                  {action.kind === "invalid" && (
                                    <span className="text-rose-700 dark:text-rose-300">Name required</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 dark:border-slate-800 px-5 py-3.5">
                  <div className="text-xs text-slate-600 dark:text-slate-400">
                    {reclassifyPreview.renameCount} rename{reclassifyPreview.renameCount === 1 ? "" : "s"},{" "}
                    {reclassifyPreview.mergeCount} merge{reclassifyPreview.mergeCount === 1 ? "" : "s"}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={reclassifyApplying}
                      onClick={closeReclassifyModal}
                      className="rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 px-3.5 py-2 text-sm font-medium text-slate-800 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={
                        reclassifyLoading ||
                        reclassifyApplying ||
                        reclassifyPreview.includedCount === 0 ||
                        reclassifyPreview.invalidCount > 0 ||
                        (reclassifyPreview.renameCount === 0 && reclassifyPreview.mergeCount === 0)
                      }
                      onClick={() => void handleConfirmReclassify()}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-500 disabled:opacity-50"
                    >
                      <Sparkles className="h-4 w-4" />
                      {reclassifyApplying ? "Applying..." : "Apply Changes"}
                    </button>
                  </div>
                </div>
              </div>
            </ModalBackdrop>
          )}
        </>
      )}
    </div>
  );
};

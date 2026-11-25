import React, { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowUpDown, Check, Clock, Plus, Search, ShoppingCart, X } from "lucide-react";
import { apiFetch, Product } from "../api";

const SORT_OPTIONS = [
  { value: "name", label: "Name", selectLabel: "Sort: Name" },
  { value: "due_date", label: "Soonest Due", selectLabel: "Sort: Soonest Due" },
  { value: "stock", label: "Stock Count", selectLabel: "Sort: Stock Count" },
] as const;

export const ProductsPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const status = searchParams.get("status") || "in_stock";
  const categoryId = searchParams.get("category_id") || "";
  const locationId = searchParams.get("location_id") || "";
  const [q, setQ] = useState(searchParams.get("q") || "");
  const [sort, setSort] = useState(searchParams.get("sort") || "name");
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const sortMenuRef = useRef<HTMLDivElement>(null);

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

  const { data, isLoading } = useQuery({
    queryKey: ["products", queryStr],
    queryFn: () => apiFetch<{ products: Product[] }>(`/api/products?${queryStr}`),
  });

  const products = data?.products || [];
  const activeSortLabel = SORT_OPTIONS.find((opt) => opt.value === sort)?.label || "Name";
  const hasActiveFilters = Boolean(categoryId || locationId || q);

  const clearFilters = () => {
    setSearchParams({ status });
    setQ("");
  };

  return (
    <div className="space-y-4">
      <div data-testid="products-toolbar" className="@container space-y-2">
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
          <div className="flex @[640px]:hidden">
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

      {isLoading ? (
        <div className="py-12 text-center text-sm text-slate-400">Loading inventory...</div>
      ) : products.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-800 py-16 text-center text-sm text-slate-400">
          No products match this view.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
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
      )}
    </div>
  );
};

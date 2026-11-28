import React from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Search, X } from "lucide-react";
import { apiFetch, Product } from "../api";

export const SearchPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const query = searchParams.get("q") || "";
  const hasQuery = query.trim().length > 0;

  const { data, isLoading } = useQuery({
    queryKey: ["quick-search", query],
    queryFn: () => apiFetch<{ products: Product[] }>(`/api/products?status=all&q=${encodeURIComponent(query)}`),
    enabled: hasQuery,
  });

  const products = data?.products || [];
  const showResultsSection = hasQuery && (products.length > 0 || (!isLoading && data !== undefined));

  const handleQueryChange = (value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value) {
      next.set("q", value);
    } else {
      next.delete("q");
    }
    setSearchParams(next, { replace: true });
  };

  return (
    <div className="mx-auto w-full max-w-lg rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
      <div className="flex items-center gap-2">
        <Search className="h-4 w-4 text-slate-600 dark:text-slate-400" />
        <input
          autoFocus
          value={query}
          onChange={(e) => handleQueryChange(e.target.value)}
          placeholder="Search products..."
          className="flex-1 bg-transparent text-sm text-slate-900 dark:text-white outline-none"
        />
        {query && (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => handleQueryChange("")}
            className="text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      {showResultsSection && (
        <>
          <hr className="my-3 border-slate-200 dark:border-slate-800" />
          {products.length > 0 ? (
            <div className="space-y-1">
              {products.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() =>
                    navigate(`/products/${p.id}`, {
                      state: { from: `${location.pathname}${location.search}` },
                    })
                  }
                  className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <span className="font-medium text-slate-900 dark:text-white">{p.name}</span>
                  <span className="text-xs text-slate-600 dark:text-slate-400">{p.in_stock_count} in stock</span>
                </button>
              ))}
            </div>
          ) : (
            <p className="py-2 text-center text-sm text-slate-600 dark:text-slate-400">No products match this search.</p>
          )}
        </>
      )}
    </div>
  );
};

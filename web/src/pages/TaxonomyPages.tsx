import React, { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Printer, Snowflake, Trash2 } from "lucide-react";
import { apiFetch, Category, Item, Location } from "../api";
import { buildHierarchyTree, flattenHierarchyTree, HierarchySelect } from "../components/HierarchySelect";

export const CategoriesPage: React.FC = () => {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState<string>("");

  const { data } = useQuery({
    queryKey: ["categories"],
    queryFn: () => apiFetch<{ categories: Category[] }>("/api/categories"),
  });
  const categories = data?.categories || [];

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    await apiFetch("/api/categories", {
      method: "POST",
      body: JSON.stringify({ name, parent_id: parentId ? Number(parentId) : null }),
    });
    setName("");
    setParentId("");
    void qc.invalidateQueries({ queryKey: ["categories"] });
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <form onSubmit={create} className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
        <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="New category name" className="min-w-[180px] flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white" />
        <div className="min-w-[200px]">
          <HierarchySelect
            items={categories}
            value={parentId ? Number(parentId) : null}
            onChange={(v) => setParentId(v ? String(v) : "")}
            allowEmpty
            emptyLabel="Top-level"
            ariaLabel="Parent category"
          />
        </div>
        <button type="submit" className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white">Add</button>
      </form>

      <div className="divide-y divide-slate-800 rounded-2xl border border-slate-800 bg-slate-900/60">
        {flattenHierarchyTree(buildHierarchyTree(categories)).map(({ item: c, depth }) => (
          <div key={c.id} className="flex items-center justify-between py-3 pr-4 text-sm" style={{ paddingLeft: `${depth * 18 + 16}px` }}>
            <span className="text-slate-100">{c.name}</span>
            <button
              type="button"
              onClick={async () => {
                await apiFetch(`/api/categories/${c.id}`, { method: "DELETE" });
                void qc.invalidateQueries({ queryKey: ["categories"] });
              }}
              className="rounded p-1.5 text-slate-400 hover:bg-rose-500/20 hover:text-rose-300"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

export const LocationsPage: React.FC = () => {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState<string>("");
  const [isFreezer, setIsFreezer] = useState(false);

  const { data } = useQuery({
    queryKey: ["locations"],
    queryFn: () => apiFetch<{ locations: Location[] }>("/api/locations"),
  });
  const locations = data?.locations || [];

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    await apiFetch("/api/locations", {
      method: "POST",
      body: JSON.stringify({ name, parent_id: parentId ? Number(parentId) : null, is_freezer: isFreezer }),
    });
    setName("");
    setParentId("");
    setIsFreezer(false);
    void qc.invalidateQueries({ queryKey: ["locations"] });
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <form onSubmit={create} className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
        <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="New location name" className="min-w-[180px] flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white" />
        <div className="min-w-[200px]">
          <HierarchySelect
            items={locations}
            value={parentId ? Number(parentId) : null}
            onChange={(v) => setParentId(v ? String(v) : "")}
            allowEmpty
            emptyLabel="Top-level"
            ariaLabel="Parent location"
          />
        </div>
        <label className="flex items-center gap-1.5 text-xs text-slate-300">
          <input type="checkbox" checked={isFreezer} onChange={(e) => setIsFreezer(e.target.checked)} />
          Freezer
        </label>
        <button type="submit" className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white">Add</button>
      </form>

      <div className="divide-y divide-slate-800 rounded-2xl border border-slate-800 bg-slate-900/60">
        {flattenHierarchyTree(buildHierarchyTree(locations)).map(({ item: l, depth }) => (
          <div key={l.id} className="flex items-center justify-between py-3 pr-4 text-sm" style={{ paddingLeft: `${depth * 18 + 16}px` }}>
            <Link to={`/locations/${l.id}`} className="flex items-center gap-2 text-slate-100 hover:text-indigo-300">
              <span>{l.name}</span>
              {l.is_freezer && <Snowflake className="h-4 w-4 text-sky-400" />}
            </Link>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => apiFetch(`/api/locations/${l.id}/print-label`, { method: "POST" })}
                className="rounded p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white"
                aria-label="Print location label"
              >
                <Printer className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={async () => {
                  await apiFetch(`/api/locations/${l.id}`, { method: "DELETE" });
                  void qc.invalidateQueries({ queryKey: ["locations"] });
                }}
                className="rounded p-1.5 text-slate-400 hover:bg-rose-500/20 hover:text-rose-300"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export const LocationDetailPage: React.FC = () => {
  const { id } = useParams();
  const [notice, setNotice] = useState<string | null>(null);
  const { data } = useQuery({
    queryKey: ["location", id],
    queryFn: () => apiFetch<{ location: Location; items: Item[] }>(`/api/locations/${id}`),
  });
  if (!data) return <div className="py-12 text-center text-sm text-slate-400">Loading location...</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">{data.location.hierarchy_name}</h2>
          {data.location.is_freezer && <span className="text-xs text-sky-400">Freezer location</span>}
        </div>
        <button
          type="button"
          onClick={async () => {
            const res = await apiFetch<{ print_warnings?: string[] }>(`/api/locations/${data.location.id}/print-label`, { method: "POST" });
            setNotice(res.print_warnings?.length ? `Warning: ${res.print_warnings.join("; ")}` : "Location label sent to printer.");
          }}
          className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white"
        >
          <Printer className="h-4 w-4" /> Print Location Label
        </button>
      </div>
      {notice && <div className="rounded-lg bg-indigo-500/15 px-3 py-2 text-sm text-indigo-200">{notice}</div>}
      <div className="divide-y divide-slate-800 rounded-2xl border border-slate-800 bg-slate-900/60">
        {data.items.map((it) => (
          <Link key={it.id} to={`/products/${it.product_id}`} className="flex items-center justify-between px-4 py-3 text-sm hover:bg-slate-800/50">
            <span>{it.product_name}</span>
            <span className="text-xs text-slate-400">{it.due_on_date ? `Due ${it.due_on_date}` : "No due date"}</span>
          </Link>
        ))}
        {data.items.length === 0 && <div className="p-6 text-center text-xs text-slate-400">No items stored here.</div>}
      </div>
    </div>
  );
};

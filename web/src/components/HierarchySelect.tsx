import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, ChevronLeft, ChevronRight, Loader2, Plus, Search, Snowflake, X } from "lucide-react";

export interface HierarchyCreateInput {
  name: string;
  parent_id: number | null;
  is_freezer?: boolean;
}

export interface HierarchyItem {
  id: number;
  name: string;
  parent_id: number | null;
  hierarchy_name?: string;
  is_freezer?: boolean;
}

export interface TreeNode<T extends HierarchyItem> {
  item: T;
  depth: number;
  children: TreeNode<T>[];
}

export function buildHierarchyTree<T extends HierarchyItem>(items: T[]): TreeNode<T>[] {
  const byParent = new Map<number | null, T[]>();
  const validIds = new Set(items.map((i) => i.id));

  for (const item of items) {
    const pid = item.parent_id != null && validIds.has(item.parent_id) ? item.parent_id : null;
    const list = byParent.get(pid) || [];
    list.push(item);
    byParent.set(pid, list);
  }

  for (const list of byParent.values()) {
    list.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  }

  const visited = new Set<number>();
  const build = (parentId: number | null, depth: number): TreeNode<T>[] => {
    const list = byParent.get(parentId) || [];
    const nodes: TreeNode<T>[] = [];
    for (const item of list) {
      if (visited.has(item.id)) continue;
      visited.add(item.id);
      nodes.push({
        item,
        depth,
        children: build(item.id, depth + 1),
      });
    }
    return nodes;
  };

  return build(null, 0);
}

export function flattenHierarchyTree<T extends HierarchyItem>(
  nodes: TreeNode<T>[]
): Array<{ item: T; depth: number; hasChildren: boolean }> {
  const out: Array<{ item: T; depth: number; hasChildren: boolean }> = [];
  const walk = (list: TreeNode<T>[]) => {
    for (const n of list) {
      out.push({ item: n.item, depth: n.depth, hasChildren: n.children.length > 0 });
      walk(n.children);
    }
  };
  walk(nodes);
  return out;
}

export function collectDescendantIds<T extends HierarchyItem>(rootId: number, items: T[]): Set<number> {
  const ids = new Set<number>([rootId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const item of items) {
      if (item.parent_id != null && ids.has(item.parent_id) && !ids.has(item.id)) {
        ids.add(item.id);
        changed = true;
      }
    }
  }
  return ids;
}

interface HierarchySelectProps<T extends HierarchyItem> {
  items: T[];
  value: number | null;
  onChange: (value: number | null) => void;
  placeholder?: string;
  allowEmpty?: boolean;
  emptyLabel?: string;
  ariaLabel?: string;
  className?: string;
  inlineMenu?: boolean;
  size?: "default" | "sm";
  onCreate?: (input: HierarchyCreateInput) => Promise<T>;
  createEntityLabel?: string;
  showFreezerOption?: boolean;
}

export function HierarchySelect<T extends HierarchyItem>({
  items,
  value,
  onChange,
  placeholder = "Select...",
  allowEmpty = false,
  emptyLabel = "None",
  ariaLabel,
  className = "",
  inlineMenu = false,
  size = "default",
  onCreate,
  createEntityLabel = "item",
  showFreezerOption = false,
}: HierarchySelectProps<T>) {
  const [open, setOpen] = useState(false);
  const [drillStack, setDrillStack] = useState<number[]>([]);
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const [portalStyle, setPortalStyle] = useState<React.CSSProperties>({});

  const byId = useMemo(() => {
    const m = new Map<number, T>();
    for (const item of items) m.set(item.id, item);
    return m;
  }, [items]);

  const childrenMap = useMemo(() => {
    const m = new Map<number | null, T[]>();
    const validIds = new Set(items.map((i) => i.id));
    for (const item of items) {
      const pid = item.parent_id != null && validIds.has(item.parent_id) ? item.parent_id : null;
      const list = m.get(pid) || [];
      list.push(item);
      m.set(pid, list);
    }
    for (const list of m.values()) {
      list.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
    }
    return m;
  }, [items]);

  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return items
      .filter((item) => (item.hierarchy_name || item.name).toLowerCase().includes(q))
      .sort((a, b) =>
        (a.hierarchy_name || a.name).localeCompare(b.hierarchy_name || b.name, undefined, { sensitivity: "base" })
      );
  }, [items, query]);

  const closeMenu = () => {
    setOpen(false);
    setDrillStack([]);
    setQuery("");
    setCreateError(null);
  };

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as Node;
      const inTrigger = containerRef.current?.contains(target);
      const inMenu = menuRef.current?.contains(target);
      if (!inTrigger && !inMenu) {
        closeMenu();
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        closeMenu();
      }
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open || inlineMenu) return;
    const updatePosition = () => {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const vw = window.innerWidth || 1024;
      const vh = window.innerHeight || 768;
      const menuWidth = Math.max(rect.width, 240);
      const left = Math.max(8, Math.min(rect.left, vw - menuWidth - 8));
      const spaceBelow = vh - rect.bottom - 12;
      const spaceAbove = rect.top - 12;
      if (spaceBelow < 220 && spaceAbove > spaceBelow) {
        setPortalStyle({
          position: "fixed",
          left,
          bottom: vh - rect.top + 4,
          width: menuWidth,
          maxHeight: Math.min(320, Math.max(140, spaceAbove)),
          zIndex: 70,
        });
      } else {
        setPortalStyle({
          position: "fixed",
          left,
          top: rect.bottom + 4,
          width: menuWidth,
          maxHeight: Math.min(320, Math.max(140, spaceBelow)),
          zIndex: 70,
        });
      }
    };
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, inlineMenu]);

  const selectedItem = value != null ? byId.get(value) || null : null;
  const currentParentId = drillStack.length > 0 ? drillStack[drillStack.length - 1] : null;
  const currentParent = currentParentId != null ? byId.get(currentParentId) || null : null;
  const visibleItems = childrenMap.get(currentParentId) || [];
  const trimmedQuery = query.trim();
  const isSearching = trimmedQuery.length > 0;
  const hasExactSiblingMatch =
    trimmedQuery.length > 0 &&
    visibleItems.some((item) => item.name.trim().toLowerCase() === trimmedQuery.toLowerCase());
  const canCreateInline = Boolean(onCreate && trimmedQuery.length > 0 && !hasExactSiblingMatch);

  const selectAndClose = (id: number | null) => {
    onChange(id);
    closeMenu();
  };

  const handleCreateInline = async (isFreezer = false) => {
    if (!onCreate || !trimmedQuery || creating) return;
    setCreating(true);
    setCreateError(null);
    try {
      const created = await onCreate({
        name: trimmedQuery,
        parent_id: currentParentId,
        ...(showFreezerOption ? { is_freezer: isFreezer } : {}),
      });
      selectAndClose(created.id);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : `Failed to create ${createEntityLabel}`);
    } finally {
      setCreating(false);
    }
  };

  const handleItemClick = (item: T) => {
    const kids = childrenMap.get(item.id);
    if (kids && kids.length > 0) {
      setDrillStack((prev) => [...prev, item.id]);
    } else {
      selectAndClose(item.id);
    }
  };

  const menuContent = open ? (
    <div
      ref={menuRef}
      data-testid={inlineMenu ? "hierarchy-inline-menu" : "hierarchy-portal-menu"}
      style={inlineMenu ? undefined : portalStyle}
      className={
        inlineMenu
          ? "mt-1.5 flex max-h-80 w-full flex-col overflow-hidden rounded-xl border border-slate-700 bg-slate-900 shadow-2xl"
          : "flex flex-col overflow-hidden rounded-xl border border-slate-700 bg-slate-900 shadow-2xl"
      }
    >
      {/* Persistent cross-hierarchy search at all drill levels */}
      <div className="border-b border-slate-800 p-2">
        <div className="relative flex items-center">
          <Search className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-slate-400" />
          <input
            ref={searchInputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              if (createError) setCreateError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.stopPropagation();
                closeMenu();
              } else if (e.key === "Enter" && canCreateInline && searchResults.length === 0) {
                e.preventDefault();
                void handleCreateInline();
              }
            }}
            placeholder={
              onCreate
                ? items.length === 0
                  ? `Type to create ${createEntityLabel}...`
                  : "Search or create..."
                : "Search all..."
            }
            aria-label={`Search ${ariaLabel || "options"}`}
            className="w-full rounded-lg border border-slate-700 bg-slate-950 py-1.5 pl-8 pr-7 text-xs text-white placeholder-slate-500 focus:border-indigo-500 focus:outline-none"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear search"
              className="absolute right-2 rounded p-0.5 text-slate-400 hover:text-white"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto py-1">
        {isSearching ? (
          searchResults.length === 0 ? (
            <div className="px-3 py-3 text-center text-xs text-slate-500">No matches found</div>
          ) : (
            searchResults.map((item) => {
              const isSelected = value === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => selectAndClose(item.id)}
                  className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition ${
                    isSelected ? "bg-indigo-600/20 text-indigo-200" : "text-slate-200 hover:bg-slate-800"
                  }`}
                >
                  <span className="flex items-center gap-1.5 truncate">
                    <span className="truncate">{item.hierarchy_name || item.name}</span>
                    {item.is_freezer && <Snowflake className="h-3.5 w-3.5 shrink-0 text-sky-400" />}
                  </span>
                  {isSelected && <Check className="h-4 w-4 shrink-0 text-indigo-400" />}
                </button>
              );
            })
          )
        ) : (
          <>
            {currentParent ? (
              <>
                <div className="flex items-center gap-1 border-b border-slate-800 px-2 py-1.5">
                  <button
                    type="button"
                    aria-label="Back"
                    onClick={() => setDrillStack((prev) => prev.slice(0, -1))}
                    className="flex items-center justify-center rounded-md p-1 text-slate-300 hover:bg-slate-800 hover:text-white"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <span className="truncate text-xs font-semibold text-slate-400">
                    {currentParent.hierarchy_name || currentParent.name}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => selectAndClose(currentParent.id)}
                  className="flex w-full items-center justify-between border-b border-slate-800 px-3 py-2 text-left text-sm font-semibold text-indigo-300 hover:bg-indigo-600/20"
                >
                  <span className="truncate">Select &ldquo;{currentParent.name}&rdquo;</span>
                  {value === currentParent.id && <Check className="h-4 w-4 shrink-0 text-indigo-400" />}
                </button>

                <div className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  Sub-items
                </div>
              </>
            ) : (
              allowEmpty && (
                <button
                  type="button"
                  onClick={() => selectAndClose(null)}
                  className="flex w-full items-center justify-between border-b border-slate-800 px-3 py-2 text-left text-sm text-slate-300 hover:bg-slate-800"
                >
                  <span>{emptyLabel}</span>
                  {value == null && <Check className="h-4 w-4 text-indigo-400" />}
                </button>
              )
            )}

            {visibleItems.length === 0 ? (
              <div className="px-3 py-3 text-center text-xs text-slate-500">
                {onCreate ? `Type a name above to create a ${createEntityLabel}.` : "No items available"}
              </div>
            ) : (
              visibleItems.map((item) => {
                const hasChildren = (childrenMap.get(item.id)?.length || 0) > 0;
                const isSelected = value === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleItemClick(item)}
                    className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition ${
                      isSelected ? "bg-indigo-600/20 text-indigo-200" : "text-slate-200 hover:bg-slate-800"
                    }`}
                  >
                    <span className="flex items-center gap-1.5 truncate">
                      <span className="truncate">{item.name}</span>
                      {item.is_freezer && <Snowflake className="h-3.5 w-3.5 shrink-0 text-sky-400" />}
                    </span>
                    {hasChildren ? (
                      <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
                    ) : isSelected ? (
                      <Check className="h-4 w-4 shrink-0 text-indigo-400" />
                    ) : null}
                  </button>
                );
              })
            )}
          </>
        )}
      </div>

      {(canCreateInline || createError) && (
        <div className="border-t border-slate-800 bg-slate-900/95 p-2 space-y-1.5">
          {createError && (
            <div role="alert" className="rounded-md bg-rose-500/15 px-2.5 py-1.5 text-xs text-rose-300">
              {createError}
            </div>
          )}
          {canCreateInline && (
            <div className="space-y-1.5">
              <button
                type="button"
                disabled={creating}
                onClick={() => void handleCreateInline(false)}
                className="flex w-full items-center gap-1.5 rounded-lg bg-indigo-600/20 px-2.5 py-2 text-left text-xs font-semibold text-indigo-200 hover:bg-indigo-600/30 disabled:opacity-50"
              >
                {creating ? (
                  <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
                ) : (
                  <Plus className="h-3.5 w-3.5 shrink-0" />
                )}
                <span className="truncate">
                  Create &ldquo;{trimmedQuery}&rdquo;
                  {currentParent ? ` in ${currentParent.name}` : ""}
                </span>
              </button>
              {showFreezerOption && (
                <button
                  type="button"
                  disabled={creating}
                  onClick={() => void handleCreateInline(true)}
                  className="flex w-full items-center gap-1.5 rounded-lg bg-sky-500/15 px-2.5 py-2 text-left text-xs font-semibold text-sky-200 hover:bg-sky-500/25 disabled:opacity-50"
                >
                  {creating ? (
                    <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
                  ) : (
                    <Plus className="h-3.5 w-3.5 shrink-0" />
                  )}
                  <span className="flex min-w-0 items-center gap-1">
                    <span className="shrink-0">Create Freezer</span>
                    {" "}
                    <Snowflake aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-sky-400" />
                    <span className="truncate">
                      &ldquo;{trimmedQuery}&rdquo;
                      {currentParent ? ` in ${currentParent.name}` : ""}
                    </span>
                  </span>
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  ) : null;

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        aria-label={ariaLabel}
        aria-expanded={open}
        onClick={() => {
          if (open) {
            closeMenu();
          } else {
            setOpen(true);
          }
        }}
        className={`flex w-full min-w-0 items-center justify-between gap-2 rounded-lg border border-slate-700 bg-slate-950 text-left text-white hover:border-slate-600 focus:border-indigo-500 focus:outline-none ${
          size === "sm" ? "h-8 px-2.5 text-xs" : "h-10 px-3 py-1.5 text-sm"
        }`}
      >
        <span className={`truncate ${selectedItem ? "text-white" : "text-slate-400"}`}>
          {selectedItem ? selectedItem.hierarchy_name || selectedItem.name : allowEmpty ? emptyLabel : placeholder}
        </span>
        <ChevronDown className={`shrink-0 text-slate-400 ${size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4"}`} />
      </button>

      {open && (inlineMenu ? menuContent : typeof document !== "undefined" ? createPortal(menuContent, document.body) : menuContent)}
    </div>
  );
}

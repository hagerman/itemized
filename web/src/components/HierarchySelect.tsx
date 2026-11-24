import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, ChevronLeft, ChevronRight, Search, Snowflake, X } from "lucide-react";

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
}: HierarchySelectProps<T>) {
  const [open, setOpen] = useState(false);
  const [drillStack, setDrillStack] = useState<number[]>([]);
  const [query, setQuery] = useState("");
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
  const isSearching = query.trim().length > 0;

  const selectAndClose = (id: number | null) => {
    onChange(id);
    closeMenu();
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
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.stopPropagation();
                closeMenu();
              }
            }}
            placeholder="Search all..."
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
              <div className="px-3 py-3 text-center text-xs text-slate-500">No items available</div>
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
        className="flex h-10 w-full min-w-0 items-center justify-between gap-2 rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-left text-sm text-white hover:border-slate-600 focus:border-indigo-500 focus:outline-none"
      >
        <span className={`truncate ${selectedItem ? "text-white" : "text-slate-400"}`}>
          {selectedItem ? selectedItem.hierarchy_name || selectedItem.name : allowEmpty ? emptyLabel : placeholder}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
      </button>

      {open && (inlineMenu ? menuContent : typeof document !== "undefined" ? createPortal(menuContent, document.body) : menuContent)}
    </div>
  );
}

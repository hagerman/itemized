import React, { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";

export interface SectionNavItem {
  id: string;
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
}

export interface SectionNavGroup {
  id: string;
  label?: string;
  items: SectionNavItem[];
}

export interface SectionNavLayoutProps {
  groups: SectionNavGroup[];
  activeId: string;
  onSelect: (id: string) => void;
  navAriaLabel: string;
  mobileSelectLabel: string;
  children: React.ReactNode;
}

export const SectionNavLayout: React.FC<SectionNavLayoutProps> = ({
  groups,
  activeId,
  onSelect,
  navAriaLabel,
  mobileSelectLabel,
  children,
}) => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);

  const activeEntry = useMemo(() => {
    for (const group of groups) {
      const item = group.items.find((i) => i.id === activeId);
      if (item) {
        return { item, groupLabel: group.label };
      }
    }
    const firstGroup = groups[0];
    const firstItem = firstGroup?.items[0];
    return firstItem ? { item: firstItem, groupLabel: firstGroup.label } : null;
  }, [groups, activeId]);

  useEffect(() => {
    if (contentRef.current) {
      contentRef.current.scrollTop = 0;
    }
  }, [activeId]);

  useEffect(() => {
    if (!mobileOpen) return;

    const handlePointerDown = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setMobileOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setMobileOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [mobileOpen]);

  const ActiveIcon = activeEntry?.item.icon;

  return (
    <div className="w-full md:flex md:h-full md:min-h-0 md:overflow-hidden">
      {/* Mobile custom styled grouped dropdown */}
      <div ref={dropdownRef} className="relative mb-4 md:hidden">
        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen((open) => !open)}
          className="flex w-full items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-left text-sm font-medium text-slate-900 shadow-xs transition hover:bg-slate-50 focus:border-indigo-600 focus:outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-white dark:shadow-none dark:hover:bg-slate-800/80"
        >
          <span className="flex min-w-0 items-center gap-2.5">
            {ActiveIcon && <ActiveIcon className="h-4 w-4 shrink-0 text-indigo-600 dark:text-indigo-400" />}
            <span className="min-w-0 truncate">
              <span className="sr-only">{mobileSelectLabel}: </span>
              {activeEntry?.groupLabel && (
                <span className="mr-1.5 text-xs font-normal text-slate-500 dark:text-slate-400">
                  {activeEntry.groupLabel} /
                </span>
              )}
              <span>{activeEntry?.item.label}</span>
            </span>
          </span>
          <ChevronDown
            className={`h-4 w-4 shrink-0 text-slate-500 transition-transform dark:text-slate-400 ${
              mobileOpen ? "rotate-180" : ""
            }`}
          />
        </button>

        {mobileOpen && (
          <div
            role="menu"
            aria-label={mobileSelectLabel}
            className="absolute inset-x-0 top-full z-30 mt-1.5 max-h-[65dvh] space-y-3 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-xl dark:border-slate-800 dark:bg-slate-900"
          >
            {groups.map((group) => (
              <div key={group.id}>
                {group.label && (
                  <div className="px-3 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    {group.label}
                  </div>
                )}
                <div className="space-y-0.5">
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    const isActive = activeId === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        role="menuitemradio"
                        aria-checked={isActive}
                        onClick={() => {
                          setMobileOpen(false);
                          onSelect(item.id);
                        }}
                        className={`flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-sm font-medium transition ${
                          isActive
                            ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300"
                            : "text-slate-700 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
                        }`}
                      >
                        <span className="flex min-w-0 items-center gap-2.5">
                          {Icon && <Icon className="h-4 w-4 shrink-0" />}
                          <span className="truncate">{item.label}</span>
                        </span>
                        {isActive && <Check className="h-4 w-4 shrink-0 text-indigo-600 dark:text-indigo-400" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Desktop independently scrollable left vertical sub-navigation */}
      <nav
        aria-label={navAriaLabel}
        className="hidden md:block md:w-60 md:shrink-0 md:overflow-y-auto md:border-r md:border-slate-200 md:p-4 dark:md:border-slate-800"
      >
        <div className="space-y-5">
          {groups.map((group) => (
            <div key={group.id}>
              {group.label && (
                <div className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  {group.label}
                </div>
              )}
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeId === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      aria-current={isActive ? "page" : undefined}
                      onClick={() => onSelect(item.id)}
                      className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm font-medium transition ${
                        isActive
                          ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300"
                          : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-900 dark:hover:text-white"
                      }`}
                    >
                      {Icon && <Icon className="h-4 w-4 shrink-0" />}
                      <span className="truncate">{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </nav>

      {/* Desktop independently scrollable right content pane */}
      <div ref={contentRef} className="min-w-0 md:flex-1 md:overflow-y-auto md:p-6">
        <div className="max-w-4xl space-y-6">{children}</div>
      </div>
    </div>
  );
};

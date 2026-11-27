import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Box,
  Clock,
  FolderTree,
  HelpCircle,
  LayoutGrid,
  LogOut,
  MapPin,
  Menu,
  RefreshCw,
  ScanBarcode,
  Search,
  Settings,
  ShoppingCart,
  Snowflake,
  X,
} from "lucide-react";
import { apiFetch, Category, Location, Product, User } from "../api";
import { BrandLogo } from "./BrandLogo";
import { useHelp } from "./HelpContext";
import { buildHierarchyTree, flattenHierarchyTree } from "./HierarchySelect";
import { ModalBackdrop } from "./ModalBackdrop";
import { ScanMode, ScannerDrawer } from "./ScannerDrawer";
import { screenIdForPathname } from "../screens";
import { KEYBOARD_SHORTCUTS } from "../shortcuts";

interface ScannerControlContextValue {
  openScanner: (mode?: ScanMode) => void;
}

export const ScannerControlContext = createContext<ScannerControlContextValue>({
  openScanner: () => {},
});

export function useScannerControl(): ScannerControlContextValue {
  return useContext(ScannerControlContext);
}

interface LayoutProps {
  user: User;
  onLogout: () => void;
  title: string;
  demoMode?: boolean;
  demoResetAt?: string;
  headerActions?: React.ReactNode;
  children: React.ReactNode;
}

function formatDemoCountdown(resetAtIso: string | undefined, nowMs: number): string {
  if (!resetAtIso) {
    return "Sample data resets every hour";
  }
  const targetMs = Date.parse(resetAtIso);
  if (Number.isNaN(targetMs)) {
    return "Sample data resets every hour";
  }
  const diffMs = targetMs - nowMs;
  if (diffMs <= 0) {
    return "Resetting sample data...";
  }
  const totalSec = Math.ceil(diffMs / 1000);
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  const timeLabel = new Date(targetMs).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (mins >= 60) {
    const hrs = Math.floor(mins / 60);
    const remMins = mins % 60;
    return `Sample data resets in ${hrs}h ${remMins}m (at ${timeLabel})`;
  }
  if (mins >= 1) {
    return `Sample data resets in ${mins}m (at ${timeLabel})`;
  }
  return `Sample data resets in ${secs}s (at ${timeLabel})`;
}

export const Layout: React.FC<LayoutProps> = ({ user, onLogout, title, demoMode = false, demoResetAt, headerActions, children }) => {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const loc = useLocation();
  const { openHelpForScreen } = useHelp();
  const [searchParams] = useSearchParams();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [treeTab, setTreeTab] = useState<"locations" | "categories">("locations");
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerRequestedMode, setScannerRequestedMode] = useState<ScanMode | undefined>(undefined);
  const [searchOpen, setSearchOpen] = useState(false);

  const openScanner = (mode?: ScanMode) => {
    setScannerRequestedMode(mode);
    setScannerOpen(true);
  };
  const [searchQuery, setSearchQuery] = useState("");
  const [helpOpen, setHelpOpen] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const refreshedBoundaryRef = useRef<string | null>(null);

  useEffect(() => {
    if (!demoMode || !demoResetAt) return;
    const targetMs = Date.parse(demoResetAt);
    if (Number.isNaN(targetMs)) return;

    const tick = () => {
      const current = Date.now();
      setNowMs(current);
      if (current >= targetMs && refreshedBoundaryRef.current !== demoResetAt) {
        refreshedBoundaryRef.current = demoResetAt;
        void qc.invalidateQueries();
      }
    };

    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [demoMode, demoResetAt, qc]);

  const pendingPrefix = useRef<string | null>(null);
  const prefixTimer = useRef<number | null>(null);

  const { data: catData } = useQuery({
    queryKey: ["categories"],
    queryFn: () => apiFetch<{ categories: Category[] }>("/api/categories"),
  });
  const { data: locData } = useQuery({
    queryKey: ["locations"],
    queryFn: () => apiFetch<{ locations: Location[] }>("/api/locations"),
  });
  const { data: countsData } = useQuery({
    queryKey: ["products", "counts"],
    queryFn: () => apiFetch<{ status_counts: Record<string, number> }>("/api/products?status=in_stock"),
  });
  const { data: quickSearchData } = useQuery({
    queryKey: ["quick-search", searchQuery],
    queryFn: () => apiFetch<{ products: Product[] }>(`/api/products?status=all&q=${encodeURIComponent(searchQuery)}`),
    enabled: searchOpen && searchQuery.trim().length > 0,
  });

  const categories = catData?.categories || [];
  const locations = locData?.locations || [];
  const counts = countsData?.status_counts || {};
  const activeStatus = searchParams.get("status") || "in_stock";
  const activeCatId = searchParams.get("category_id");
  const activeLocId = searchParams.get("location_id");

  // Gmail-style keyboard shortcuts (g+i, g+s, g+d, g+o, g+a, n, Esc, ?)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isTyping =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable);
      if (isTyping) return;
      if (e.key !== "Escape" && (e.metaKey || e.ctrlKey || e.altKey)) return;

      if (e.key === "Escape") {
        if (helpOpen) { setHelpOpen(false); return; }
        if (searchOpen) { setSearchOpen(false); return; }
        if (scannerOpen) { setScannerOpen(false); return; }
        if (loc.pathname !== "/") { navigate("/"); }
        return;
      }
      if (pendingPrefix.current === "g") {
        pendingPrefix.current = null;
        if (prefixTimer.current) clearTimeout(prefixTimer.current);
        const match = KEYBOARD_SHORTCUTS.find((s) => s.prefix === "g" && s.key === e.key && s.route);
        if (match?.route) {
          e.preventDefault();
          navigate(match.route);
        }
        return;
      }
      if (e.key === "?") {
        e.preventDefault();
        setHelpOpen((v) => !v);
        return;
      }
      if (e.key === "g" && !pendingPrefix.current) {
        pendingPrefix.current = "g";
        prefixTimer.current = window.setTimeout(() => {
          pendingPrefix.current = null;
        }, 1000);
        return;
      }
      const direct = KEYBOARD_SHORTCUTS.find((s) => !s.prefix && s.key === e.key && s.route);
      if (direct?.route) {
        e.preventDefault();
        navigate(direct.route);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [helpOpen, searchOpen, scannerOpen, loc.pathname, navigate]);

  const buildFilterUrl = (overrides: { status?: string; category_id?: string | null; location_id?: string | null }) => {
    const next = new URLSearchParams();
    next.set("status", overrides.status ?? activeStatus);
    const cid = overrides.category_id === undefined ? activeCatId : overrides.category_id;
    const lid = overrides.location_id === undefined ? activeLocId : overrides.location_id;
    if (cid) next.set("category_id", cid);
    if (lid) next.set("location_id", lid);
    return `/?${next.toString()}`;
  };

  const sidebarContent = (
    <div className="flex h-full flex-col bg-slate-900 border-r border-slate-800">
      <div className="flex h-[calc(4rem+env(safe-area-inset-top))] items-center justify-between border-b border-slate-800 px-4 pt-[env(safe-area-inset-top)]">
        <Link to="/" className="flex items-center gap-2.5 text-lg font-bold tracking-tight text-white">
          <BrandLogo className="h-8 w-8 shrink-0" />
          <span>itemized</span>
        </Link>
        <button type="button" onClick={() => setMobileMenuOpen(false)} className="rounded-lg p-1 text-slate-400 lg:hidden">
          <X className="h-5 w-5" />
        </button>
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto p-3">
        <div className="space-y-1">
          {[
            { id: "in_stock", label: "In Stock", icon: LayoutGrid },
            { id: "shopping_list", label: "Shopping List", icon: ShoppingCart, badge: counts.shopping_list },
            { id: "due_soon", label: "Due Soon", icon: Clock, badge: counts.due_soon },
            { id: "overdue", label: "Overdue", icon: AlertTriangle, badge: counts.overdue },
            { id: "all", label: "All Items", icon: Box },
          ].map((item) => {
            const Icon = item.icon;
            const active = loc.pathname === "/" && activeStatus === item.id;
            return (
              <Link
                key={item.id}
                to={buildFilterUrl({ status: item.id })}
                onClick={() => setMobileMenuOpen(false)}
                className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm font-medium transition ${
                  active ? "bg-indigo-600/20 text-indigo-300" : "text-slate-300 hover:bg-slate-800 hover:text-white"
                }`}
              >
                <span className="flex items-center gap-2.5">
                  <Icon className="h-4 w-4" />
                  {item.label}
                </span>
                {item.badge ? (
                  <span className="rounded-full bg-indigo-600/30 px-2 py-0.5 text-xs font-semibold text-indigo-200">
                    {item.badge}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </div>

        <div className="hidden space-y-1 border-t border-slate-800 pt-3 lg:block">
          <button
            type="button"
            onClick={() => setScannerOpen(true)}
            className="flex w-full items-center gap-2.5 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-500"
          >
            <ScanBarcode className="h-4 w-4" /> Scan / Action
          </button>
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-slate-300 hover:bg-slate-800 hover:text-white"
          >
            <Search className="h-4 w-4" /> Quick Search
          </button>
        </div>

        {/* Tabbed Locations / Categories Tree */}
        <div className="border-t border-slate-800 pt-3">
          <div className="mb-2 grid grid-cols-2 rounded-lg bg-slate-950 p-1 text-xs font-medium">
            <button
              type="button"
              onClick={() => setTreeTab("locations")}
              className={`rounded-md py-1.5 ${treeTab === "locations" ? "bg-slate-800 text-white" : "text-slate-400"}`}
            >
              Locations
            </button>
            <button
              type="button"
              onClick={() => setTreeTab("categories")}
              className={`rounded-md py-1.5 ${treeTab === "categories" ? "bg-slate-800 text-white" : "text-slate-400"}`}
            >
              Categories
            </button>
          </div>

          {treeTab === "locations" ? (
            <div className="space-y-0.5">
              <div className="flex items-center justify-between px-2 py-1 text-xs text-slate-400">
                <span>Filter by location</span>
                <Link to="/locations" onClick={() => setMobileMenuOpen(false)} className="text-indigo-300 hover:underline">Manage</Link>
              </div>
              {flattenHierarchyTree(buildHierarchyTree(locations)).map(({ item: l, depth }) => {
                const isSelected = activeLocId === String(l.id);
                return (
                  <Link
                    key={l.id}
                    to={buildFilterUrl({ location_id: isSelected ? null : String(l.id), category_id: null })}
                    onClick={() => setMobileMenuOpen(false)}
                    style={{ paddingLeft: `${depth * 14 + 10}px` }}
                    title={isSelected ? "Click to clear filter" : l.hierarchy_name}
                    className={`flex items-center justify-between rounded-lg py-1.5 pr-2.5 text-xs transition ${
                      isSelected ? "bg-indigo-600/20 font-medium text-indigo-200" : "text-slate-300 hover:bg-slate-800"
                    }`}
                  >
                    <span className="flex items-center gap-1.5 truncate">
                      <MapPin className={`h-3.5 w-3.5 shrink-0 ${isSelected ? "text-indigo-400" : "text-slate-500"}`} />
                      <span className="truncate">{l.name}</span>
                    </span>
                    {l.is_freezer && <Snowflake className="h-3.5 w-3.5 shrink-0 text-sky-400" />}
                  </Link>
                );
              })}
            </div>
          ) : (
            <div className="space-y-0.5">
              <div className="flex items-center justify-between px-2 py-1 text-xs text-slate-400">
                <span>Filter by category</span>
                <Link to="/categories" onClick={() => setMobileMenuOpen(false)} className="text-indigo-300 hover:underline">Manage</Link>
              </div>
              {flattenHierarchyTree(buildHierarchyTree(categories)).map(({ item: c, depth }) => {
                const isSelected = activeCatId === String(c.id);
                return (
                  <Link
                    key={c.id}
                    to={buildFilterUrl({ category_id: isSelected ? null : String(c.id), location_id: null })}
                    onClick={() => setMobileMenuOpen(false)}
                    style={{ paddingLeft: `${depth * 14 + 10}px` }}
                    title={isSelected ? "Click to clear filter" : c.hierarchy_name}
                    className={`flex items-center gap-1.5 rounded-lg py-1.5 pr-2.5 text-xs transition ${
                      isSelected ? "bg-indigo-600/20 font-medium text-indigo-200" : "text-slate-300 hover:bg-slate-800"
                    }`}
                  >
                    <FolderTree className={`h-3.5 w-3.5 shrink-0 ${isSelected ? "text-indigo-400" : "text-slate-500"}`} />
                    <span className="truncate">{c.name}</span>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </nav>

      <div className="space-y-1 border-t border-slate-800 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] lg:pb-3">
        <Link
          to="/help"
          onClick={() => setMobileMenuOpen(false)}
          className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-medium transition ${
            loc.pathname.startsWith("/help")
              ? "bg-indigo-600/20 text-indigo-300"
              : "text-slate-300 hover:bg-slate-800 hover:text-white"
          }`}
        >
          <HelpCircle className="h-4 w-4 shrink-0" />
          <span>Help</span>
        </Link>
        <div className="flex items-center justify-between gap-1 text-xs">
          <Link
            to="/settings"
            onClick={() => setMobileMenuOpen(false)}
            className={`flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-medium transition ${
              loc.pathname.startsWith("/settings")
                ? "bg-indigo-600/20 text-indigo-300"
                : "text-slate-400 hover:bg-slate-800 hover:text-white"
            }`}
          >
            <Settings className="h-4 w-4 shrink-0" />
            <span className="truncate">{user.email}</span>
          </Link>
          {!demoMode && (
            <button
              type="button"
              onClick={onLogout}
              aria-label="Logout"
              className="shrink-0 rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-800 hover:text-white"
            >
              <LogOut className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex h-dvh overflow-hidden bg-slate-950 text-slate-100">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[80] focus:rounded-lg focus:bg-indigo-600 focus:px-3 focus:py-2 focus:text-sm focus:font-semibold focus:text-white"
      >
        Skip to content
      </a>
      {/* Desktop persistent sidebar */}
      <aside className="hidden w-64 shrink-0 lg:block">{sidebarContent}</aside>

      {/* Mobile slide-out drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div className="w-72 max-w-[85vw]">{sidebarContent}</div>
          <div className="flex-1 bg-black/60" onClick={() => setMobileMenuOpen(false)} />
        </div>
      )}

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex h-[calc(4rem+env(safe-area-inset-top))] shrink-0 items-center justify-between border-b border-slate-800 bg-slate-900 px-4 pt-[env(safe-area-inset-top)]">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open navigation"
              className="rounded-lg p-2 text-slate-300 hover:bg-slate-800 lg:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>
            <h1 className="truncate text-lg font-semibold text-white">{title}</h1>
          </div>
          <div className="flex items-center gap-2">
            {headerActions}
            <button
              type="button"
              onClick={() => openHelpForScreen(screenIdForPathname(loc.pathname))}
              aria-label="Help for this screen"
              title="Help"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/80 px-2.5 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-700 hover:text-white"
            >
              <HelpCircle className="h-4 w-4 text-indigo-300" />
              <span className="hidden sm:inline">Help</span>
            </button>
          </div>
        </header>

        {demoMode && (
          <div
            role="status"
            data-testid="demo-banner"
            className="flex shrink-0 items-center justify-center gap-2 border-b border-amber-500/30 bg-amber-500/15 px-4 py-1.5 text-xs font-medium text-amber-200"
          >
            <RefreshCw className="h-3.5 w-3.5 shrink-0 text-amber-300" />
            <span>
              <strong className="font-semibold text-amber-100">Demo Mode</strong> — {formatDemoCountdown(demoResetAt, nowMs)}
            </span>
          </div>
        )}

        <main id="main-content" tabIndex={-1} className="flex-1 overflow-y-auto p-4 pb-[calc(5rem+env(safe-area-inset-bottom))] lg:pb-6">
          <ScannerControlContext.Provider value={{ openScanner }}>
            {children}
          </ScannerControlContext.Provider>
        </main>
      </div>

      {/* Mobile Bottom Dock */}
      <nav
        aria-label="Mobile navigation"
        className="fixed inset-x-0 bottom-0 z-40 grid h-[calc(4rem+env(safe-area-inset-bottom))] grid-cols-3 border-t border-slate-800 bg-slate-900/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
      >
        <Link
          to="/"
          aria-current={loc.pathname === "/" ? "page" : undefined}
          className={`flex flex-col items-center justify-center gap-0.5 text-xs transition ${
            loc.pathname === "/" ? "font-semibold text-indigo-400" : "text-slate-400"
          }`}
        >
          <Box className="h-5 w-5" />
          <span>Inventory</span>
        </Link>
        <button
          type="button"
          onClick={() => setScannerOpen(true)}
          className="flex flex-col items-center justify-center gap-0.5 bg-indigo-600 text-xs font-semibold text-white"
        >
          <ScanBarcode className="h-5 w-5" />
          <span>Scan / Action</span>
        </button>
        <Link
          to="/search"
          aria-current={loc.pathname === "/search" ? "page" : undefined}
          className={`flex flex-col items-center justify-center gap-0.5 text-xs transition ${
            loc.pathname === "/search" ? "font-semibold text-indigo-400" : "text-slate-400"
          }`}
        >
          <Search className="h-5 w-5" />
          <span>Search</span>
        </Link>
      </nav>

      {/* Unified Scanner Drawer */}
      <ScannerDrawer
        open={scannerOpen}
        requestedMode={scannerRequestedMode}
        onClose={() => {
          setScannerOpen(false);
          setScannerRequestedMode(undefined);
        }}
        categories={categories}
        locations={locations}
      />

      {/* Quick Search Modal */}
      {searchOpen && (
        <ModalBackdrop
          onClose={() => setSearchOpen(false)}
          ariaLabel="Quick Search"
          className="flex items-start justify-center p-4 pt-20"
        >
          <div className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900 p-4 shadow-2xl">
            <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
              <Search className="h-4 w-4 text-slate-400" />
              <input
                autoFocus
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search products..."
                className="flex-1 bg-transparent text-sm text-white outline-none"
              />
              <button type="button" onClick={() => setSearchOpen(false)} className="text-slate-400 hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-2 max-h-72 space-y-1 overflow-y-auto">
              {(quickSearchData?.products || []).map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    setSearchOpen(false);
                    setSearchQuery("");
                    navigate(`/products/${p.id}`);
                  }}
                  className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-800"
                >
                  <span className="font-medium text-white">{p.name}</span>
                  <span className="text-xs text-slate-400">{p.in_stock_count} in stock</span>
                </button>
              ))}
            </div>
          </div>
        </ModalBackdrop>
      )}

      {/* Keyboard Shortcuts Help Modal */}
      {helpOpen && (
        <ModalBackdrop
          onClose={() => setHelpOpen(false)}
          ariaLabel="Keyboard Shortcuts"
          className="flex items-center justify-center p-4"
        >
          <div className="w-full max-w-sm rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-2xl">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold text-white">Keyboard Shortcuts</h2>
              <button type="button" onClick={() => setHelpOpen(false)} className="text-slate-400 hover:text-white"><X className="h-4 w-4" /></button>
            </div>
            <ul className="space-y-1.5 text-xs text-slate-300">
              {KEYBOARD_SHORTCUTS.map((s) => (
                <li key={s.keys} className="flex justify-between gap-3">
                  <span>{s.label}</span>
                  <kbd className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-slate-200">{s.keys}</kbd>
                </li>
              ))}
            </ul>
            <div className="mt-4 border-t border-slate-800 pt-3 text-right">
              <Link
                to="/help"
                onClick={() => setHelpOpen(false)}
                className="text-xs font-medium text-indigo-400 hover:text-indigo-300 hover:underline"
              >
                Open full Help guide →
              </Link>
            </div>
          </div>
        </ModalBackdrop>
      )}
    </div>
  );
};

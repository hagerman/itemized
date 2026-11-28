export interface AppScreen {
  id: string;
  kind: "route" | "settings" | "dialog";
  label: string;
  routePath?: string;
}

export const APP_SCREENS: AppScreen[] = [
  // App routes (must match App.tsx)
  { id: "inventory", kind: "route", label: "Inventory", routePath: "/" },
  { id: "search", kind: "route", label: "Search", routePath: "/search" },
  { id: "product-new", kind: "route", label: "New Product", routePath: "/products/new" },
  { id: "product-detail", kind: "route", label: "Product Detail", routePath: "/products/:id" },
  { id: "product-edit", kind: "route", label: "Edit Product", routePath: "/products/:id/edit" },
  { id: "categories", kind: "route", label: "Categories", routePath: "/categories" },
  { id: "locations", kind: "route", label: "Locations", routePath: "/locations" },
  { id: "location-detail", kind: "route", label: "Location Detail", routePath: "/locations/:id" },
  { id: "qr-action", kind: "route", label: "QR Quick Action", routePath: "/go/:kind/:id" },
  { id: "settings", kind: "route", label: "Settings", routePath: "/settings" },
  { id: "help", kind: "route", label: "Help", routePath: "/help" },
  { id: "help-article", kind: "route", label: "Help Article", routePath: "/help/*" },

  // Settings sections / cards (must match SettingsPage.tsx and settings components)
  { id: "settings/account", kind: "settings", label: "Account" },
  { id: "settings/notifications", kind: "settings", label: "Push Notifications" },
  { id: "settings/api-tokens", kind: "settings", label: "API Tokens" },
  { id: "settings/instance", kind: "settings", label: "Instance Configuration" },
  { id: "settings/oidc", kind: "settings", label: "OIDC" },
  { id: "settings/llm", kind: "settings", label: "LLM Product Classification" },
  { id: "settings/users", kind: "settings", label: "Household Users" },
  { id: "settings/printers", kind: "settings", label: "Label Printers" },
  { id: "settings/label-templates", kind: "settings", label: "ZPL Label Templates" },

  // Dialogs and drawers with contextual Help
  { id: "dialog/scanner", kind: "dialog", label: "Scan / Action Drawer" },
  { id: "dialog/merge-products", kind: "dialog", label: "Merge Products" },
  { id: "dialog/reclassify-products", kind: "dialog", label: "Reclassify Products" },
];

export const APP_SCREEN_IDS = APP_SCREENS.map((s) => s.id);

export function screenIdForPathname(pathname: string): string {
  if (pathname === "/") return "inventory";
  if (pathname === "/search") return "search";
  if (pathname === "/products/new") return "product-new";
  if (/^\/products\/[^/]+\/edit$/.test(pathname)) return "product-edit";
  if (/^\/products\/[^/]+$/.test(pathname)) return "product-detail";
  if (pathname === "/categories") return "categories";
  if (pathname === "/locations") return "locations";
  if (/^\/locations\/[^/]+$/.test(pathname)) return "location-detail";
  if (/^\/go\/[^/]+\/[^/]+$/.test(pathname)) return "qr-action";
  if (pathname === "/settings") return "settings";
  if (pathname === "/help") return "help";
  if (/^\/help\/[^/]+$/.test(pathname)) return "help-article";
  return "inventory";
}

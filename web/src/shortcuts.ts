export interface KeyboardShortcut {
  keys: string;
  label: string;
  description: string;
  category: "Navigation" | "Actions" | "Help";
  prefix?: "g";
  key: string;
  route?: string;
}

export const KEYBOARD_SHORTCUTS: KeyboardShortcut[] = [
  {
    keys: "g i",
    label: "In Stock",
    description: "Open the In Stock inventory view",
    category: "Navigation",
    prefix: "g",
    key: "i",
    route: "/?status=in_stock",
  },
  {
    keys: "g s",
    label: "Shopping List",
    description: "Open the Shopping List view",
    category: "Navigation",
    prefix: "g",
    key: "s",
    route: "/?status=shopping_list",
  },
  {
    keys: "g d",
    label: "Due Soon",
    description: "Open the Due Soon inventory view",
    category: "Navigation",
    prefix: "g",
    key: "d",
    route: "/?status=due_soon",
  },
  {
    keys: "g o",
    label: "Overdue",
    description: "Open the Overdue inventory view",
    category: "Navigation",
    prefix: "g",
    key: "o",
    route: "/?status=overdue",
  },
  {
    keys: "g a",
    label: "All Items",
    description: "Open the All Items inventory view",
    category: "Navigation",
    prefix: "g",
    key: "a",
    route: "/?status=all",
  },
  {
    keys: "g ?",
    label: "Open Help",
    description: "Open the in-app Help center",
    category: "Help",
    prefix: "g",
    key: "?",
    route: "/help",
  },
  {
    keys: "n",
    label: "New Product",
    description: "Create a new product",
    category: "Actions",
    key: "n",
    route: "/products/new",
  },
  {
    keys: "Esc",
    label: "Back / Close",
    description: "Close open dialogs or return to Inventory",
    category: "Actions",
    key: "Escape",
  },
  {
    keys: "?",
    label: "Shortcuts Cheat Sheet",
    description: "Toggle the keyboard shortcuts cheat sheet",
    category: "Help",
    key: "?",
  },
];

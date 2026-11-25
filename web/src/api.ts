export interface User {
  id: number;
  email: string;
  role: "admin" | "member";
  oidc_issuer?: string;
  oidc_subject?: string;
  created_at: string;
  updated_at: string;
}

export interface AuthStatus {
  initialized: boolean;
  oidc_enabled: boolean;
  oidc_force: boolean;
  llm_enabled?: boolean;
  demo_mode?: boolean;
  demo_reset_at?: string;
  user: User | null;
}

export interface Category {
  id: number;
  name: string;
  parent_id: number | null;
  hierarchy_name: string;
}

export interface Location {
  id: number;
  legacy_uuid?: string;
  name: string;
  parent_id: number | null;
  is_freezer: boolean;
  hierarchy_name: string;
}

export interface Barcode {
  id: number;
  variant_id: number;
  barcode: string;
  default_quantity: number;
}

export interface Variant {
  id: number;
  product_id: number;
  name: string;
  volume_value: number | null;
  volume_unit: string | null;
  weight_value: number | null;
  weight_unit: string | null;
  length_value: number | null;
  length_unit: string | null;
  barcodes: Barcode[];
}

export interface Product {
  id: number;
  legacy_uuid?: string;
  name: string;
  category_id: number;
  category_name: string;
  default_location_id: number;
  default_location_name: string;
  default_due_days: number | null;
  calculated_due_days?: number | null;
  default_due_days_on_open: number | null;
  default_due_days_on_freeze: number | null;
  default_due_days_on_thaw: number | null;
  use_average_for_due_date: boolean;
  label_print_mode: "none" | "single" | "per_item";
  minimum_value: number | null;
  manually_added_to_shopping_list: boolean;
  volume_value: number | null;
  volume_unit: string | null;
  weight_value: number | null;
  weight_unit: string | null;
  length_value: number | null;
  length_unit: string | null;
  in_stock_count: number;
  next_due_on_date: string | null;
  next_location_name?: string;
  on_shopping_list: boolean;
  low_stock: boolean;
  low_stock_amount: number | null;
  due_soon: boolean;
  overdue: boolean;
}

export interface Item {
  id: number;
  legacy_uuid?: string;
  product_id: number;
  product_name: string;
  variant_id: number | null;
  variant_name: string;
  location_id: number | null;
  location_name: string;
  purchased_on_date: string | null;
  opened_on_date: string | null;
  due_on_date: string | null;
  consumed_on_date: string | null;
  notes: string | null;
}

export interface PrinterRecord {
  id: number;
  name: string;
  description: string | null;
  driver: "ipp_zpl" | "raw_tcp_zpl";
  endpoint: string;
  printer_model: string | null;
  enabled: boolean;
}

export interface LabelTemplate {
  entity_type: "item" | "product" | "location";
  content: string;
  is_custom: boolean;
  default_content: string;
}

export interface AppSettings {
  base_url: string;
  due_date_average_count: number;
  oidc_issuer: string;
  oidc_client_id: string;
  oidc_has_secret: boolean;
  oidc_auto_provision: boolean;
  oidc_force: boolean;
  llm_provider: string;
  llm_model: string;
  llm_base_url: string;
  llm_has_api_key: boolean;
}

export type ScanResolution =
  | { kind: "item"; item: Item; product: Product }
  | { kind: "product"; product: Product; items: Item[] }
  | { kind: "location"; location: Location; items: Item[] }
  | { kind: "barcode"; barcode: Barcode; variant_id: number; variant_name: string; product: Product; items: Item[] }
  | { kind: "unknown"; barcode?: string; input?: string };

export class ApiError extends Error {
  status: number;
  data?: Record<string, unknown>;
  constructor(status: number, message: string, data?: Record<string, unknown>) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
    ...init,
  });
  const text = await res.text();
  let data: Record<string, unknown> = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { error: text };
    }
  }
  if (!res.ok) {
    throw new ApiError(res.status, (data.error as string) || res.statusText, data);
  }
  return data as T;
}

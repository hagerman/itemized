import React, { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Check, ChevronDown, ChevronRight, HelpCircle, Loader2, RotateCcw, ScanBarcode, Sparkles, X } from "lucide-react";
import {
  apiFetch,
  Category,
  invalidateInventoryQueries,
  Item,
  Location,
  Product,
  ScanResolution,
  usePrintersEnabled,
} from "../api";
import { BarcodeScanner } from "./BarcodeScanner";
import { useHelp } from "./HelpContext";
import { HierarchyCreateInput, HierarchySelect } from "./HierarchySelect";
import { ModalBackdrop } from "./ModalBackdrop";
import { NumberInput, OptionalNumberInput } from "./NumberInput";
import {
  EMPTY_MEASUREMENT,
  MeasurementDraft,
  MeasurementFields,
  measurementFromLLM,
  measurementToPayload,
  measurementToVariantWorkflowPayload,
} from "./MeasurementFields";

export type ScanMode = "purchase" | "consume" | "open" | "transfer" | "inventory";

interface ScannerDrawerProps {
  open: boolean;
  initialMode?: ScanMode;
  requestedMode?: ScanMode;
  onClose: () => void;
  categories: Category[];
  locations: Location[];
}

interface UndoToast {
  message: string;
  itemId: number;
  patch: Record<string, unknown>;
}

interface InventorySummary {
  to_consume: Item[];
  to_transfer: Item[];
  to_confirm: Item[];
  to_create: Array<{ product_id: number; product_name: string; quantity: number; due_on_date: string | null }>;
}

export const SCAN_MODE_STORAGE_KEY = "itemized.scanMode";

const MODES: Array<{ id: ScanMode; label: string }> = [
  { id: "purchase", label: "Purchase" },
  { id: "consume", label: "Consume" },
  { id: "open", label: "Open" },
  { id: "transfer", label: "Transfer" },
  { id: "inventory", label: "Inventory" },
];

function isValidScanMode(value: string | null): value is ScanMode {
  return value !== null && MODES.some((m) => m.id === value);
}

function readSavedScanMode(): ScanMode | null {
  try {
    if (typeof window === "undefined" || !window.localStorage) return null;
    const saved = window.localStorage.getItem(SCAN_MODE_STORAGE_KEY);
    return isValidScanMode(saved) ? saved : null;
  } catch {
    return null;
  }
}

function writeSavedScanMode(mode: ScanMode): void {
  try {
    if (typeof window === "undefined" || !window.localStorage) return;
    window.localStorage.setItem(SCAN_MODE_STORAGE_KEY, mode);
  } catch {
    // Ignore storage errors (e.g., private browsing / quota exceeded)
  }
}

function isMobileDevice(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  return (
    window.matchMedia("(max-width: 767px)").matches ||
    window.matchMedia("(pointer: coarse)").matches
  );
}

function computeDefaultDueDateStr(p: Product): string {
  const days = p.use_average_for_due_date
    ? (p.calculated_due_days ?? p.default_due_days)
    : p.default_due_days;
  if (days == null || days <= 0) return "";
  const d = new Date();
  d.setDate(d.getDate() + days);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export const ScannerDrawer: React.FC<ScannerDrawerProps> = ({
  open,
  initialMode,
  requestedMode,
  onClose,
  categories,
  locations,
}) => {
  const [mode, setMode] = useState<ScanMode>(() => requestedMode ?? readSavedScanMode() ?? initialMode ?? "purchase");

  useEffect(() => {
    if (open && requestedMode) {
      setMode(requestedMode);
    }
  }, [open, requestedMode]);

  const handleModeChange = (next: ScanMode) => {
    setMode(next);
    writeSavedScanMode(next);
  };

  if (!open) return null;

  return (
    <ScannerDrawerContent
      mode={mode}
      onModeChange={handleModeChange}
      onClose={onClose}
      categories={categories}
      locations={locations}
    />
  );
};

interface ScannerDrawerContentProps {
  mode: ScanMode;
  onModeChange: (mode: ScanMode) => void;
  onClose: () => void;
  categories: Category[];
  locations: Location[];
}

const ScannerDrawerContent: React.FC<ScannerDrawerContentProps> = ({
  mode,
  onModeChange,
  onClose,
  categories,
  locations,
}) => {
  const qc = useQueryClient();
  const printersEnabled = usePrintersEnabled();
  const { openHelpForScreen } = useHelp();
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [toast, setToast] = useState<UndoToast | null>(null);
  const [createdCategories, setCreatedCategories] = useState<Category[]>([]);
  const [createdLocations, setCreatedLocations] = useState<Location[]>([]);

  const effectiveCategories = React.useMemo(() => {
    const map = new Map<number, Category>();
    for (const c of categories) map.set(c.id, c);
    for (const c of createdCategories) if (!map.has(c.id)) map.set(c.id, c);
    return Array.from(map.values());
  }, [categories, createdCategories]);

  const effectiveLocations = React.useMemo(() => {
    const map = new Map<number, Location>();
    for (const l of locations) map.set(l.id, l);
    for (const l of createdLocations) if (!map.has(l.id)) map.set(l.id, l);
    return Array.from(map.values());
  }, [locations, createdLocations]);

  const handleCreateCategory = async (input: HierarchyCreateInput): Promise<Category> => {
    const res = await apiFetch<{ category: Category }>("/api/categories", {
      method: "POST",
      body: JSON.stringify({ name: input.name, parent_id: input.parent_id }),
    });
    setCreatedCategories((prev) => [...prev, res.category]);
    void qc.invalidateQueries({ queryKey: ["categories"] });
    return res.category;
  };

  const handleCreateLocation = async (input: HierarchyCreateInput): Promise<Location> => {
    const res = await apiFetch<{ location: Location }>("/api/locations", {
      method: "POST",
      body: JSON.stringify({
        name: input.name,
        parent_id: input.parent_id,
        is_freezer: Boolean(input.is_freezer),
      }),
    });
    setCreatedLocations((prev) => [...prev, res.location]);
    void qc.invalidateQueries({ queryKey: ["locations"] });
    return res.location;
  };

  // Purchase state (flattened: Confirm & Add + expandable variant/barcode section)
  const [purchaseProduct, setPurchaseProduct] = useState<Product | null>(null);
  const [creatingNew, setCreatingNew] = useState(false);
  const [newProdName, setNewProdName] = useState("");
  const [newProdCatId, setNewProdCatId] = useState<number>(0);
  const [newProdLocId, setNewProdLocId] = useState<number>(0);
  const [newProdDueDays, setNewProdDueDays] = useState("");
  const [newProdUseAvg, setNewProdUseAvg] = useState(true);
  const [purchaseBarcode, setPurchaseBarcode] = useState("");
  const [purchaseBarcodeQty, setPurchaseBarcodeQty] = useState(1);
  const [secondBarcode, setSecondBarcode] = useState("");
  const [secondBarcodeQty, setSecondBarcodeQty] = useState(1);
  const [variantId, setVariantId] = useState<number | null>(null);
  const [variantName, setVariantName] = useState("");
  const [showVariantSection, setShowVariantSection] = useState(false);
  const [purchaseQty, setPurchaseQty] = useState(1);
  const [purchaseLocId, setPurchaseLocId] = useState<number>(0);
  const [purchaseDueDate, setPurchaseDueDate] = useState("");
  const [purchasePrintMode, setPurchasePrintMode] = useState("per_item");
  const [purchaseSearchHits, setPurchaseSearchHits] = useState<Product[]>([]);
  const [purchaseExistingQuery, setPurchaseExistingQuery] = useState("");
  const [llmMatchedProduct, setLlmMatchedProduct] = useState<Product | null>(null);
  const [liveSimilarProducts, setLiveSimilarProducts] = useState<Product[]>([]);
  const [upcHint, setUpcHint] = useState<string | null>(null);
  const [classifyWarning, setClassifyWarning] = useState<string | null>(null);
  const [lookupPhase, setLookupPhase] = useState<"idle" | "upc" | "classify">("idle");
  const [newProdMeasurement, setNewProdMeasurement] = useState<MeasurementDraft>(EMPTY_MEASUREMENT);
  const [variantMeasurement, setVariantMeasurement] = useState<MeasurementDraft>(EMPTY_MEASUREMENT);
  const [scanTarget, setScanTarget] = useState<null | "primary_barcode" | "second_barcode">(null);
  const lookupSeqRef = useRef(0);
  const userEditedNameRef = useRef(false);
  const userEditedCatRef = useRef(false);
  const userEditedProdMeasRef = useRef(false);
  const userEditedVarMeasRef = useRef(false);

  // Consume / Open / Transfer item selection state
  const [actionSearchHits, setActionSearchHits] = useState<Product[]>([]);
  const [candidateItems, setCandidateItems] = useState<Item[]>([]);
  const [candidateHeading, setCandidateHeading] = useState<string | null>(null);
  const [selectedItemIds, setSelectedItemIds] = useState<number[]>([]);
  const [unknownBarcodeForAssoc, setUnknownBarcodeForAssoc] = useState<string | null>(null);
  const [assocQuery, setAssocQuery] = useState("");
  const [assocMatches, setAssocMatches] = useState<Product[]>([]);

  // Transfer state
  const [transferItems, setTransferItems] = useState<Item[]>([]);
  const [transferDest, setTransferDest] = useState<Location | null>(null);

  // Inventory Audit state
  const [invLocation, setInvLocation] = useState<Location | null>(null);
  const [invScannedItemIds, setInvScannedItemIds] = useState<number[]>([]);
  const [invScannedProducts, setInvScannedProducts] = useState<Array<{ product_id: number; product_name: string; quantity: number }>>([]);
  const [invSummary, setInvSummary] = useState<InventorySummary | null>(null);
  const [invConsumeIds, setInvConsumeIds] = useState<number[]>([]);
  const [invTransferIds, setInvTransferIds] = useState<number[]>([]);
  const [invCreateMap, setInvCreateMap] = useState<Record<number, { selected: boolean; due_on_date: string }>>({});

  useEffect(() => {
    return () => {
      lookupSeqRef.current += 1;
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  // Live debounced similar-product lookup while typing a new product name in Purchase mode.
  useEffect(() => {
    if (mode !== "purchase" || !creatingNew || !userEditedNameRef.current) {
      setLiveSimilarProducts([]);
      return;
    }
    const trimmed = newProdName.trim();
    if (trimmed.length < 2) {
      setLiveSimilarProducts([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const search = await apiFetch<{ products: Product[] }>(
          `/api/products?status=all&q=${encodeURIComponent(trimmed)}`
        );
        if (!cancelled) {
          setLiveSimilarProducts((search.products || []).slice(0, 5));
        }
      } catch {
        if (!cancelled) setLiveSimilarProducts([]);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [mode, creatingNew, newProdName]);

  // Inline search for existing products when an unknown barcode has no auto-match.
  useEffect(() => {
    if (mode !== "purchase" || !creatingNew) return;
    const trimmed = purchaseExistingQuery.trim();
    if (trimmed.length < 2) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const search = await apiFetch<{ products: Product[] }>(
          `/api/products?status=all&q=${encodeURIComponent(trimmed)}`
        );
        if (!cancelled) {
          setPurchaseSearchHits((search.products || []).slice(0, 5));
        }
      } catch {
        // ignore transient search errors
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [mode, creatingNew, purchaseExistingQuery]);

  const resetSubState = () => {
    lookupSeqRef.current += 1;
    userEditedNameRef.current = false;
    userEditedCatRef.current = false;
    userEditedProdMeasRef.current = false;
    userEditedVarMeasRef.current = false;
    setStatusMsg(null);
    setErrorMsg(null);
    setPurchaseProduct(null);
    setCreatingNew(false);
    setNewProdName("");
    setNewProdCatId(0);
    setNewProdLocId(0);
    setPurchaseLocId(0);
    setPurchaseQty(1);
    setPurchaseBarcodeQty(1);
    setSecondBarcodeQty(1);
    setVariantId(null);
    setShowVariantSection(false);
    setPurchasePrintMode("per_item");
    setPurchaseSearchHits([]);
    setPurchaseExistingQuery("");
    setLlmMatchedProduct(null);
    setLiveSimilarProducts([]);
    setUpcHint(null);
    setClassifyWarning(null);
    setLookupPhase("idle");
    setNewProdDueDays("");
    setNewProdUseAvg(true);
    setPurchaseDueDate("");
    setNewProdMeasurement(EMPTY_MEASUREMENT);
    setVariantMeasurement(EMPTY_MEASUREMENT);
    setVariantName("");
    setPurchaseBarcode("");
    setSecondBarcode("");
    setActionSearchHits([]);
    setCandidateItems([]);
    setCandidateHeading(null);
    setSelectedItemIds([]);
    setTransferItems([]);
    setTransferDest(null);
    setUnknownBarcodeForAssoc(null);
    setInvSummary(null);
    setScanTarget(null);
  };

  const invalidateInventory = () => {
    invalidateInventoryQueries(qc);
  };

  const handleUndo = async () => {
    if (!toast) return;
    try {
      await apiFetch(`/api/items/${toast.itemId}`, {
        method: "PATCH",
        body: JSON.stringify(toast.patch),
      });
      setStatusMsg("Action undone.");
      setToast(null);
      invalidateInventory();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Undo failed");
    }
  };

  const handleScan = async (raw: string) => {
    setErrorMsg(null);
    setStatusMsg(null);

    if (scanTarget === "primary_barcode") {
      setPurchaseBarcode(raw.trim());
      setScanTarget(null);
      setStatusMsg(`Captured primary barcode: ${raw.trim()}`);
      return;
    }
    if (scanTarget === "second_barcode") {
      setSecondBarcode(raw.trim());
      setScanTarget(null);
      setStatusMsg(`Captured second barcode: ${raw.trim()}`);
      return;
    }

    try {
      const resolved = await apiFetch<ScanResolution>("/api/scan/resolve", {
        method: "POST",
        body: JSON.stringify({ input: raw }),
      });

      if (mode === "purchase") {
        await handlePurchaseScan(raw, resolved);
      } else if (mode === "consume" || mode === "open") {
        await handleConsumeOpenScan(raw, resolved, mode);
      } else if (mode === "transfer") {
        await handleTransferScan(raw, resolved);
      } else if (mode === "inventory") {
        await handleInventoryScan(raw, resolved);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Scan failed");
    }
  };

  const handlePurchaseScan = async (raw: string, res: ScanResolution) => {
    if (res.kind === "barcode") {
      lookupSeqRef.current += 1;
      setLookupPhase("idle");
      setUpcHint(null);
      setClassifyWarning(null);
      setPurchaseSearchHits([]);
      setPurchaseExistingQuery("");
      setLlmMatchedProduct(null);
      setLiveSimilarProducts([]);
      setPurchaseProduct(res.product);
      setCreatingNew(false);
      setVariantId(res.variant_id);
      setVariantName(res.variant_name);
      setPurchaseBarcode(res.barcode.barcode);
      setPurchaseBarcodeQty(res.barcode.default_quantity || 1);
      setSecondBarcode("");
      setSecondBarcodeQty(1);
      setPurchaseQty(res.barcode.default_quantity || 1);
      setPurchaseLocId(res.product.default_location_id);
      setPurchaseDueDate(computeDefaultDueDateStr(res.product));
      setPurchasePrintMode(res.product.label_print_mode);
      setShowVariantSection(false);
      setStatusMsg(`Matched ${res.product.name} (${res.variant_name})`);
      return;
    }
    if (res.kind === "product" || res.kind === "item") {
      lookupSeqRef.current += 1;
      setLookupPhase("idle");
      setUpcHint(null);
      setClassifyWarning(null);
      setPurchaseSearchHits([]);
      setPurchaseExistingQuery("");
      setLlmMatchedProduct(null);
      setLiveSimilarProducts([]);
      const p = res.product;
      setPurchaseProduct(p);
      setCreatingNew(false);
      setVariantId(null);
      setVariantName("");
      setPurchaseBarcode("");
      setPurchaseBarcodeQty(1);
      setSecondBarcode("");
      setSecondBarcodeQty(1);
      setPurchaseQty(1);
      setPurchaseLocId(p.default_location_id);
      setPurchaseDueDate(computeDefaultDueDateStr(p));
      setPurchasePrintMode(p.label_print_mode);
      setStatusMsg(`Selected ${p.name}`);
      return;
    }

    // Unknown barcode or text search
    const isNumericBarcode = /^\d{6,14}$/.test(raw.trim());
    if (isNumericBarcode) {
      const seq = ++lookupSeqRef.current;
      userEditedNameRef.current = false;
      userEditedCatRef.current = false;
      userEditedProdMeasRef.current = false;
      userEditedVarMeasRef.current = false;

      setPurchaseProduct(null);
      setPurchaseSearchHits([]);
      setPurchaseExistingQuery("");
      setLlmMatchedProduct(null);
      setLiveSimilarProducts([]);
      setUpcHint(null);
      setClassifyWarning(null);
      setNewProdName("");
      setNewProdDueDays("");
      setNewProdUseAvg(true);
      setPurchaseDueDate("");
      setVariantName("");
      setNewProdMeasurement(EMPTY_MEASUREMENT);
      setVariantMeasurement(EMPTY_MEASUREMENT);
      setPurchaseBarcode(raw.trim());
      setPurchaseBarcodeQty(1);
      setSecondBarcode("");
      setSecondBarcodeQty(1);
      setPurchaseQty(1);
      setPurchasePrintMode("per_item");
      setShowVariantSection(true);
      setVariantId(null);
      setNewProdCatId(0);
      setNewProdLocId(0);
      setPurchaseLocId(0);
      setLookupPhase("upc");

      try {
        const upcRes = await apiFetch<{ found: boolean; result?: { title: string; description?: string; measurement?: string } }>("/api/upc/lookup", {
          method: "POST",
          body: JSON.stringify({ barcode: raw.trim() }),
        });
        if (lookupSeqRef.current !== seq) return;

        let suggestedName = "";
        let matchedExisting = false;
        if (upcRes.found && upcRes.result) {
          const title = upcRes.result.title || "";
          const description = upcRes.result.description || "";
          suggestedName = title;
          setUpcHint(`OpenFoodFacts: ${title}${upcRes.result.measurement ? ` (${upcRes.result.measurement})` : ""}`);
          if (title) {
            setVariantName(title);
            if (!userEditedNameRef.current) {
              setNewProdName(title);
            }
          }
          setCreatingNew(true);
          setLookupPhase("classify");

          try {
            const clsRes = await apiFetch<{
              enabled: boolean;
              warning?: string;
              classification?: {
                product_name?: string;
                matched_product_id?: number | null;
                product_value?: number | null;
                product_unit_type?: string | null;
                product_unit?: string | null;
                category_id?: number | null;
              } | null;
              matched_product?: Product | null;
            }>("/api/upc/classify", {
              method: "POST",
              body: JSON.stringify({
                title,
                description,
                quantity: upcRes.result.measurement || "",
              }),
            });
            if (lookupSeqRef.current !== seq) return;

            if (clsRes.warning) {
              setClassifyWarning(clsRes.warning);
            }
            if (clsRes.classification?.product_name && !userEditedNameRef.current) {
              suggestedName = clsRes.classification.product_name;
              setNewProdName(suggestedName);
            }
            const clsCatId = clsRes.classification?.category_id;
            if (clsCatId && !userEditedCatRef.current && categories.some((c) => c.id === clsCatId)) {
              setNewProdCatId(clsCatId);
            }
            const llmMeas = measurementFromLLM(
              clsRes.classification?.product_value,
              clsRes.classification?.product_unit_type,
              clsRes.classification?.product_unit
            );
            if (llmMeas.type) {
              if (!userEditedProdMeasRef.current) setNewProdMeasurement(llmMeas);
              if (!userEditedVarMeasRef.current) setVariantMeasurement(llmMeas);
            }
            if (clsRes.matched_product && clsRes.classification?.matched_product_id) {
              matchedExisting = true;
              const mp = clsRes.matched_product;
              setLlmMatchedProduct(mp);
              setPurchaseProduct(mp);
              setCreatingNew(false);
              setPurchaseLocId(mp.default_location_id);
              setPurchaseDueDate(computeDefaultDueDateStr(mp));
              setPurchasePrintMode(mp.label_print_mode);
            }
          } catch (err) {
            if (lookupSeqRef.current === seq) {
              setClassifyWarning(err instanceof Error ? err.message : "Classification failed");
            }
          }
        } else {
          setUpcHint("Barcode not found in OpenFoodFacts. Pick an existing product or create a new one.");
          setCreatingNew(true);
        }

        if (lookupSeqRef.current !== seq) return;
        setLookupPhase("idle");

        if (suggestedName && !matchedExisting) {
          const search = await apiFetch<{ products: Product[] }>(`/api/products?status=all&q=${encodeURIComponent(suggestedName)}`);
          if (lookupSeqRef.current !== seq) return;
          setPurchaseSearchHits(search.products.slice(0, 5));
        }
      } finally {
        if (lookupSeqRef.current === seq) {
          setLookupPhase("idle");
        }
      }
      return;
    }

    // Text search for existing product
    lookupSeqRef.current += 1;
    userEditedNameRef.current = false;
    userEditedCatRef.current = false;
    userEditedProdMeasRef.current = false;
    userEditedVarMeasRef.current = false;
    setLookupPhase("idle");
    setUpcHint(null);
    setClassifyWarning(null);
    setPurchaseProduct(null);
    setCreatingNew(false);
    setPurchaseExistingQuery("");
    setLlmMatchedProduct(null);
    setLiveSimilarProducts([]);
    setVariantId(null);
    setVariantName("");
    setPurchaseBarcode("");
    setPurchaseBarcodeQty(1);
    setSecondBarcode("");
    setSecondBarcodeQty(1);
    setPurchaseQty(1);
    setPurchaseLocId(0);
    setPurchaseDueDate("");
    setPurchasePrintMode("per_item");
    setShowVariantSection(false);
    setNewProdName("");
    setNewProdCatId(0);
    setNewProdLocId(0);
    setNewProdDueDays("");
    setNewProdUseAvg(true);
    setNewProdMeasurement(EMPTY_MEASUREMENT);
    setVariantMeasurement(EMPTY_MEASUREMENT);

    const search = await apiFetch<{ products: Product[] }>(`/api/products?status=all&q=${encodeURIComponent(raw)}`);
    setPurchaseSearchHits(search.products.slice(0, 8));
    if (search.products.length === 0) {
      setNewProdName(raw);
      setCreatingNew(true);
    }
  };

  const submitPurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    const missingCat = creatingNew && !newProdCatId;
    const missingLoc = !purchaseLocId;
    if (missingCat && missingLoc) {
      setErrorMsg("Please select a category and location.");
      return;
    }
    if (missingCat) {
      setErrorMsg("Please select a category.");
      return;
    }
    if (missingLoc) {
      setErrorMsg("Please select a location.");
      return;
    }
    try {
      const payload: Record<string, unknown> = {
        variant_id: variantId,
        variant_name: variantName || undefined,
        ...(variantId == null ? measurementToVariantWorkflowPayload(variantMeasurement) : {}),
        barcode: purchaseBarcode || undefined,
        barcode_quantity: purchaseBarcodeQty,
        second_barcode: secondBarcode || undefined,
        second_barcode_quantity: secondBarcodeQty,
        location_id: purchaseLocId || undefined,
        due_on_date: purchaseDueDate || undefined,
        quantity: purchaseQty,
        label_print_mode: purchasePrintMode,
      };
      if (purchaseProduct && !creatingNew) {
        payload.product_id = purchaseProduct.id;
      } else {
        payload.new_product = {
          name: newProdName,
          category_id: newProdCatId,
          default_location_id: newProdLocId || purchaseLocId,
          default_due_days: newProdUseAvg ? null : newProdDueDays ? Number(newProdDueDays) : null,
          use_average_for_due_date: newProdUseAvg,
          label_print_mode: purchasePrintMode,
          ...measurementToPayload(newProdMeasurement),
        };
      }
      const res = await apiFetch<{ product: Product; items: Item[]; print_warnings?: string[] }>("/api/workflows/purchase", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      const warn = res.print_warnings?.length ? ` (Print warning: ${res.print_warnings.join("; ")})` : "";
      resetSubState();
      setStatusMsg(`Added ${res.items.length} × ${res.product.name}${warn}`);
      invalidateInventory();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Purchase failed");
    }
  };

  const loadProductCandidates = async (product: Product, targetMode: "consume" | "open" | "transfer") => {
    setErrorMsg(null);
    setStatusMsg(null);
    setActionSearchHits([]);
    try {
      const detail = await apiFetch<{ items: Item[] }>(`/api/products/${product.id}`);
      const items = detail.items || [];
      if (items.length === 0) {
        setCandidateItems([]);
        setCandidateHeading(null);
        setSelectedItemIds([]);
        setStatusMsg(`No in-stock items found for ${product.name}.`);
        return;
      }
      const eligibleItems = targetMode === "open" ? items.filter((it) => !it.opened_on_date) : items;
      if (targetMode === "open" && eligibleItems.length === 0) {
        setCandidateItems([]);
        setCandidateHeading(null);
        setSelectedItemIds([]);
        setToast(null);
        setErrorMsg(
          items.length === 1 && items[0].opened_on_date
            ? `${product.name} was already opened (${items[0].opened_on_date}).`
            : `All in-stock items of ${product.name} were already opened.`
        );
        return;
      }
      setCandidateHeading(`Select items of ${product.name}`);
      setCandidateItems(eligibleItems);
      if (targetMode === "transfer") {
        const firstUnstaged = eligibleItems.find((it) => !transferItems.some((t) => t.id === it.id));
        setSelectedItemIds(firstUnstaged ? [firstUnstaged.id] : []);
      } else {
        setSelectedItemIds([eligibleItems[0].id]);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Failed to load product items");
    }
  };

  const searchInStockProducts = async (raw: string, targetMode: "consume" | "open" | "transfer") => {
    const query = raw.trim();
    setCandidateItems([]);
    setCandidateHeading(null);
    setSelectedItemIds([]);
    setActionSearchHits([]);
    const search = await apiFetch<{ products: Product[] }>(`/api/products?status=in_stock&q=${encodeURIComponent(query)}`);
    if (search.products.length === 0) {
      setStatusMsg(`No in-stock products matching "${query}".`);
      return;
    }
    if (search.products.length === 1) {
      await loadProductCandidates(search.products[0], targetMode);
      return;
    }
    setActionSearchHits(search.products.slice(0, 8));
  };

  const handleConsumeOpenScan = async (raw: string, res: ScanResolution, action: "consume" | "open") => {
    setActionSearchHits([]);
    if (res.kind === "item") {
      if (res.item.consumed_on_date) {
        const itemName = res.item.product_name || res.product?.name || `Item #${res.item.id}`;
        setToast(null);
        setErrorMsg(`${itemName} was already consumed (${res.item.consumed_on_date}).`);
        return;
      }
      if (action === "open" && res.item.opened_on_date) {
        const itemName = res.item.product_name || res.product?.name || `Item #${res.item.id}`;
        setToast(null);
        setErrorMsg(`${itemName} was already opened (${res.item.opened_on_date}).`);
        return;
      }
      const resp = await apiFetch<{ item: Item; previous: Item; already_opened?: boolean; already_consumed?: boolean }>(`/api/items/${res.item.id}/${action}`, {
        method: "POST",
      });
      if (action === "consume" && resp.already_consumed) {
        const itemName = resp.item.product_name || res.product?.name || `Item #${resp.item.id}`;
        setToast(null);
        setErrorMsg(`${itemName} was already consumed (${resp.item.consumed_on_date}).`);
        return;
      }
      if (action === "open" && resp.already_opened) {
        const itemName = resp.item.product_name || res.product?.name || `Item #${resp.item.id}`;
        setToast(null);
        setErrorMsg(`${itemName} was already opened (${resp.item.opened_on_date}).`);
        return;
      }
      setToast({
        message: `${action === "consume" ? "Consumed" : "Opened"} ${resp.item.product_name}`,
        itemId: resp.item.id,
        patch: action === "consume"
          ? { consumed_on_date: resp.previous.consumed_on_date }
          : { opened_on_date: resp.previous.opened_on_date, due_on_date: resp.previous.due_on_date },
      });
      invalidateInventory();
      return;
    }
    if (res.kind === "product" || res.kind === "barcode" || res.kind === "location") {
      setCandidateHeading(null);
      if (res.items.length === 0) {
        setCandidateItems([]);
        setSelectedItemIds([]);
        setStatusMsg("No unconsumed items found.");
        return;
      }
      const eligibleItems = action === "open" ? res.items.filter((it) => !it.opened_on_date) : res.items;
      if (action === "open" && eligibleItems.length === 0) {
        setCandidateItems([]);
        setSelectedItemIds([]);
        setToast(null);
        if (res.kind === "location") {
          const locName = res.location?.hierarchy_name || res.location?.name || "this location";
          setErrorMsg(`All in-stock items in ${locName} were already opened.`);
        } else {
          const prodName = res.product?.name || res.items[0]?.product_name || "This product";
          setErrorMsg(
            res.items.length === 1 && res.items[0].opened_on_date
              ? `${prodName} was already opened (${res.items[0].opened_on_date}).`
              : `All in-stock items of ${prodName} were already opened.`
          );
        }
        return;
      }
      setCandidateItems(eligibleItems);
      setSelectedItemIds(eligibleItems.length > 0 ? [eligibleItems[0].id] : []);
      return;
    }
    if (/^\d{6,14}$/.test(raw.trim())) {
      setUnknownBarcodeForAssoc(raw.trim());
      setStatusMsg(`Unrecognized barcode ${raw.trim()} — link it to a product below.`);
      return;
    }
    await searchInStockProducts(raw, action);
  };

  const applyCandidateItems = async () => {
    if (selectedItemIds.length === 0) return;
    try {
      const action = mode === "transfer" ? "transfer" : mode;
      await apiFetch("/api/items/bulk", {
        method: "POST",
        body: JSON.stringify({
          action,
          item_ids: selectedItemIds,
          location_id: mode === "transfer" ? transferDest?.id : undefined,
        }),
      });
      setStatusMsg(`Updated ${selectedItemIds.length} item(s).`);
      setActionSearchHits([]);
      setCandidateItems([]);
      setCandidateHeading(null);
      setSelectedItemIds([]);
      invalidateInventory();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Action failed");
    }
  };

  const associateUnknownBarcode = async (product: Product) => {
    if (!unknownBarcodeForAssoc) return;
    try {
      const detail = await apiFetch<{ variants: Array<{ id: number }>; items: Item[] }>(`/api/products/${product.id}`);
      let vId = detail.variants[0]?.id;
      if (!vId) {
        const createdV = await apiFetch<{ variant: { id: number } }>(`/api/products/${product.id}/variants`, {
          method: "POST",
          body: JSON.stringify({ name: "Default" }),
        });
        vId = createdV.variant.id;
      }
      await apiFetch(`/api/variants/${vId}/barcodes`, {
        method: "POST",
        body: JSON.stringify({ barcode: unknownBarcodeForAssoc, default_quantity: 1 }),
      });
      setUnknownBarcodeForAssoc(null);
      const eligibleItems = mode === "open" ? detail.items.filter((it) => !it.opened_on_date) : detail.items;
      if (mode === "open" && detail.items.length > 0 && eligibleItems.length === 0) {
        setCandidateItems([]);
        setSelectedItemIds([]);
        setStatusMsg(`Linked barcode to ${product.name}`);
        setErrorMsg(
          detail.items.length === 1 && detail.items[0].opened_on_date
            ? `${product.name} was already opened (${detail.items[0].opened_on_date}).`
            : `All in-stock items of ${product.name} were already opened.`
        );
        return;
      }
      setCandidateItems(eligibleItems);
      setSelectedItemIds(eligibleItems.length > 0 ? [eligibleItems[0].id] : []);
      setStatusMsg(`Linked barcode to ${product.name}`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Association failed");
    }
  };

  const executeTransfer = async (dest: Location) => {
    if (transferItems.length === 0) {
      setErrorMsg("Scan one or more items to transfer first.");
      return;
    }
    try {
      const res = await apiFetch<{ processed?: number; print_warnings?: string[] }>("/api/items/bulk", {
        method: "POST",
        body: JSON.stringify({
          action: "transfer",
          item_ids: transferItems.map((it) => it.id),
          location_id: dest.id,
        }),
      });
      const count = transferItems.length;
      const warn = res.print_warnings?.length ? ` (Print warning: ${res.print_warnings.join("; ")})` : "";
      setTransferItems([]);
      setTransferDest(null);
      setActionSearchHits([]);
      setCandidateItems([]);
      setCandidateHeading(null);
      setSelectedItemIds([]);
      setStatusMsg(`Transferred ${count} item(s) to ${dest.hierarchy_name || dest.name}${warn}`);
      invalidateInventory();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Transfer failed");
    }
  };

  const addCandidatesToTransfer = () => {
    if (selectedItemIds.length === 0) return;
    const chosen = candidateItems.filter((it) => selectedItemIds.includes(it.id));
    const existingIds = new Set(transferItems.map((it) => it.id));
    const newlyAdded = chosen.filter((it) => !existingIds.has(it.id));
    if (newlyAdded.length > 0) {
      setTransferItems((prev) => {
        const seen = new Set(prev.map((it) => it.id));
        const next = [...prev];
        for (const it of newlyAdded) {
          if (!seen.has(it.id)) {
            seen.add(it.id);
            next.push(it);
          }
        }
        return next;
      });
      setStatusMsg(`Added ${newlyAdded.length} item(s) to transfer list.`);
    } else {
      setStatusMsg("Selected item(s) are already in the transfer list.");
    }
    setActionSearchHits([]);
    setCandidateItems([]);
    setCandidateHeading(null);
    setSelectedItemIds([]);
  };

  const handleTransferScan = async (raw: string, res: ScanResolution) => {
    setActionSearchHits([]);
    if (res.kind === "location") {
      if (transferItems.length === 0) {
        setErrorMsg("Scan one or more items to transfer first.");
        return;
      }
      await executeTransfer(res.location);
      return;
    }
    if (res.kind === "item") {
      if (res.item.consumed_on_date) {
        const itemName = res.item.product_name || res.product?.name || `Item #${res.item.id}`;
        setErrorMsg(`${itemName} was already consumed (${res.item.consumed_on_date}).`);
        return;
      }
      if (transferItems.some((it) => it.id === res.item.id)) {
        setStatusMsg(`${res.item.product_name} (#${res.item.id}) is already in the transfer list.`);
        return;
      }
      setTransferItems((prev) => (prev.some((it) => it.id === res.item.id) ? prev : [...prev, res.item]));
      setStatusMsg(`Added ${res.item.product_name} to transfer list.`);
      return;
    }
    if (res.kind === "product") {
      const items = res.items || [];
      if (items.length === 0) {
        setCandidateItems([]);
        setCandidateHeading(null);
        setSelectedItemIds([]);
        setStatusMsg(`No in-stock items found for ${res.product.name}.`);
        return;
      }
      const firstUnstaged = items.find((it) => !transferItems.some((t) => t.id === it.id));
      setCandidateHeading(`Select items of ${res.product.name}`);
      setCandidateItems(items);
      setSelectedItemIds(firstUnstaged ? [firstUnstaged.id] : []);
      return;
    }
    if (res.kind === "barcode") {
      const variantItems = (res.items || []).filter((it) => it.variant_id === res.variant_id);
      if (variantItems.length === 0) {
        setCandidateItems([]);
        setCandidateHeading(null);
        setSelectedItemIds([]);
        setStatusMsg(`No in-stock items found for ${res.product.name} (${res.variant_name}).`);
        return;
      }
      const firstUnstaged = variantItems.find((it) => !transferItems.some((t) => t.id === it.id));
      setCandidateHeading(`Select items of ${res.product.name} (${res.variant_name})`);
      setCandidateItems(variantItems);
      setSelectedItemIds(firstUnstaged ? [firstUnstaged.id] : []);
      return;
    }
    if (/^\d{6,14}$/.test(raw.trim())) {
      setErrorMsg("Unrecognized barcode or QR code.");
      return;
    }
    await searchInStockProducts(raw, "transfer");
  };

  const handleInventoryScan = async (_raw: string, res: ScanResolution) => {
    if (!invLocation) {
      if (res.kind === "location") {
        setInvLocation(res.location);
        setStatusMsg(`Auditing ${res.location.hierarchy_name}`);
      } else {
        setErrorMsg("Select or scan a location to audit first.");
      }
      return;
    }
    if (res.kind === "item") {
      setInvScannedItemIds((prev) => (prev.includes(res.item.id) ? prev : [...prev, res.item.id]));
      setStatusMsg(`Scanned item #${res.item.id} (${res.product.name})`);
      return;
    }
    if (res.kind === "product" || res.kind === "barcode") {
      const p = res.product;
      setInvScannedProducts((prev) => {
        const existing = prev.find((x) => x.product_id === p.id);
        if (existing) {
          return prev.map((x) => (x.product_id === p.id ? { ...x, quantity: x.quantity + 1 } : x));
        }
        return [...prev, { product_id: p.id, product_name: p.name, quantity: 1 }];
      });
      setStatusMsg(`Counted ${p.name}`);
    }
  };

  const buildInventorySummary = async () => {
    if (!invLocation) return;
    try {
      const summary = await apiFetch<InventorySummary>("/api/workflows/inventory/summary", {
        method: "POST",
        body: JSON.stringify({
          location_id: invLocation.id,
          scanned_item_ids: invScannedItemIds,
          scanned_products: invScannedProducts.map((p) => ({ product_id: p.product_id, quantity: p.quantity })),
        }),
      });
      setInvSummary(summary);
      setInvConsumeIds(summary.to_consume.map((i) => i.id));
      setInvTransferIds(summary.to_transfer.map((i) => i.id));
      const cMap: Record<number, { selected: boolean; due_on_date: string }> = {};
      summary.to_create.forEach((c) => {
        cMap[c.product_id] = { selected: true, due_on_date: c.due_on_date || "" };
      });
      setInvCreateMap(cMap);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Summary failed");
    }
  };

  const applyInventoryAudit = async () => {
    if (!invLocation || !invSummary) return;
    try {
      const createItems = invSummary.to_create
        .filter((c) => invCreateMap[c.product_id]?.selected)
        .map((c) => ({
          product_id: c.product_id,
          quantity: c.quantity,
          due_on_date: invCreateMap[c.product_id]?.due_on_date || null,
        }));
      const res = await apiFetch<{ consumed: number; transferred: number; created: number }>("/api/workflows/inventory/apply", {
        method: "POST",
        body: JSON.stringify({
          location_id: invLocation.id,
          consume_item_ids: invConsumeIds,
          transfer_item_ids: invTransferIds,
          create_items: createItems,
        }),
      });
      setInvSummary(null);
      setInvScannedItemIds([]);
      setInvScannedProducts([]);
      setStatusMsg(`Audit applied: ${res.consumed} consumed, ${res.transferred} transferred, ${res.created} created.`);
      invalidateInventory();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Apply failed");
    }
  };

  const purchaseMissingRequired = (creatingNew && !newProdCatId) || !purchaseLocId;

  const hasPurchaseContent =
    lookupPhase !== "idle" ||
    Boolean(upcHint) ||
    Boolean(classifyWarning && lookupPhase === "idle") ||
    (purchaseSearchHits.length > 0 && !purchaseProduct) ||
    Boolean(purchaseProduct || creatingNew);

  return (
    <ModalBackdrop onClose={onClose} ariaLabel="Scanner" className="flex items-end justify-center sm:items-center">
      <div className="flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 shadow-2xl sm:rounded-2xl">
        {/* Header & Mode Switcher */}
        <div className="border-b border-slate-200 dark:border-slate-800 px-4 py-3">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">Scan &amp; Action</h2>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => openHelpForScreen("dialog/scanner")}
                aria-label="Help for Scan and Action"
                className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-indigo-700 dark:text-indigo-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-indigo-800 dark:hover:text-indigo-200"
              >
                <HelpCircle className="h-4 w-4" /> Help
              </button>
              <button type="button" onClick={onClose} aria-label="Close scanner" className="rounded-lg p-1.5 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>
          <div className="grid grid-cols-5 gap-1 rounded-xl bg-white dark:bg-slate-900 p-1">
            {MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => {
                  onModeChange(m.id);
                  resetSubState();
                }}
                className={`rounded-lg py-1.5 text-xs font-medium transition ${
                  mode === m.id ? "bg-indigo-600 text-white shadow" : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        {/* Body */}
        <div data-testid="scanner-body" className="flex-1 space-y-4 overflow-y-auto p-4">
          {/* Persistent single-stream scanner across all modes */}
          <BarcodeScanner
            active={true}
            defaultCameraEnabled={isMobileDevice()}
            flashOnScan={mode === "consume"}
            allowQrCodes={mode !== "purchase"}
            onScan={handleScan}
          />

          {toast && (
            <div className="flex items-center justify-between rounded-xl border border-emerald-200 dark:border-emerald-500/40 bg-emerald-50 dark:bg-emerald-500/15 px-3 py-2 text-sm text-emerald-800 dark:text-emerald-200">
              <span>{toast.message}</span>
              <button
                type="button"
                onClick={handleUndo}
                className="flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-500"
              >
                <RotateCcw className="h-3.5 w-3.5" /> Undo
              </button>
            </div>
          )}

          {statusMsg && <div className="rounded-lg border border-indigo-200 dark:border-indigo-500/30 bg-indigo-50/70 dark:bg-indigo-500/10 px-3 py-2 text-sm text-indigo-800 dark:text-indigo-200">{statusMsg}</div>}
          {errorMsg && <div className="rounded-lg border border-rose-200 dark:border-rose-500/40 bg-rose-50 dark:bg-rose-500/15 px-3 py-2 text-sm text-rose-800 dark:text-rose-200">{errorMsg}</div>}

          {/* PURCHASE WORKFLOW */}
          {mode === "purchase" && hasPurchaseContent && (
            <div className="space-y-3">
              {lookupPhase === "upc" && (
                <div
                  role="status"
                  className="flex items-center gap-2 rounded-lg border border-indigo-200 dark:border-indigo-500/30 bg-indigo-50/70 dark:bg-indigo-500/10 px-3 py-2 text-xs text-indigo-800 dark:text-indigo-200"
                >
                  <Loader2 className="h-4 w-4 animate-spin text-indigo-600 dark:text-indigo-400" />
                  <span>Looking up barcode in OpenFoodFacts...</span>
                </div>
              )}

              {upcHint && (
                <div className="flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-xs text-slate-700 dark:text-slate-300">
                  <Sparkles className="h-4 w-4 text-amber-700 dark:text-amber-400" />
                  <span>{upcHint}</span>
                </div>
              )}

              {lookupPhase === "classify" && (
                <div
                  role="status"
                  className="flex items-center gap-2 rounded-lg border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-200"
                >
                  <Loader2 className="h-4 w-4 animate-spin text-amber-700 dark:text-amber-400" />
                  <span>Classifying product...</span>
                </div>
              )}

              {classifyWarning && lookupPhase === "idle" && (
                <div className="rounded-lg border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-200">
                  Product classifier warning: {classifyWarning}
                </div>
              )}

              {llmMatchedProduct && purchaseProduct && !creatingNew && (
                <div
                  data-testid="llm-matched-product-banner"
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-emerald-200 dark:border-emerald-500/40 bg-emerald-50 dark:bg-emerald-500/10 px-3 py-2 text-xs text-emerald-800 dark:text-emerald-200"
                >
                  <span>
                    Matched existing product: <strong className="font-semibold text-slate-900 dark:text-white">{llmMatchedProduct.name}</strong>
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setPurchaseProduct(null);
                      setLlmMatchedProduct(null);
                      setPurchaseLocId(0);
                      setNewProdLocId(0);
                      setCreatingNew(true);
                    }}
                    className="rounded-md border border-emerald-200 dark:border-emerald-400/40 bg-emerald-100 dark:bg-emerald-500/20 px-2.5 py-1 text-xs font-medium text-emerald-900 dark:text-emerald-100 hover:bg-emerald-100 dark:hover:bg-emerald-500/30"
                  >
                    Create new product instead
                  </button>
                </div>
              )}

              {creatingNew && purchaseBarcode && (
                <div className="space-y-1.5">
                  <input
                    value={purchaseExistingQuery}
                    onChange={(e) => setPurchaseExistingQuery(e.target.value)}
                    placeholder="Search existing products to attach this barcode..."
                    aria-label="Search existing products"
                    className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-sm text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500"
                  />
                </div>
              )}

              {purchaseSearchHits.length > 0 && !purchaseProduct && (
                <div className="space-y-1.5">
                  <div className="text-xs font-medium uppercase tracking-wider text-slate-600 dark:text-slate-400">Matching Products</div>
                  {purchaseSearchHits.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => {
                        setPurchaseProduct(p);
                        setCreatingNew(false);
                        setLlmMatchedProduct(null);
                        setPurchaseLocId(p.default_location_id);
                        setPurchaseDueDate(computeDefaultDueDateStr(p));
                        setPurchasePrintMode(p.label_print_mode);
                      }}
                      className="flex w-full items-center justify-between rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-left text-sm hover:border-indigo-500"
                    >
                      <span className="font-medium text-slate-900 dark:text-slate-100">{p.name}</span>
                      <span className="text-xs text-slate-600 dark:text-slate-400">{p.category_name}</span>
                    </button>
                  ))}
                </div>
              )}

              {(purchaseProduct || creatingNew) && (
                <form onSubmit={submitPurchase} className="space-y-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 p-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                      {creatingNew ? "Create Product & Add Items" : `Confirm & Add: ${purchaseProduct?.name}`}
                    </h3>
                    {creatingNew && purchaseSearchHits.length > 0 && (
                      <span className="text-xs text-slate-600 dark:text-slate-400">Or pick a match above</span>
                    )}
                  </div>

                  {creatingNew && (
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="space-y-1">
                        <input
                          required
                          value={newProdName}
                          onChange={(e) => {
                            userEditedNameRef.current = true;
                            setNewProdName(e.target.value);
                          }}
                          placeholder="Product name"
                          className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-white"
                        />
                        {liveSimilarProducts.length > 0 && (
                          <div
                            data-testid="scanner-similar-products"
                            className="space-y-1 rounded-lg border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 p-2"
                          >
                            <div className="text-[11px] font-medium text-amber-900 dark:text-amber-200">Similar existing products</div>
                            {liveSimilarProducts.map((p) => (
                              <button
                                key={p.id}
                                type="button"
                                onClick={() => {
                                  setPurchaseProduct(p);
                                  setCreatingNew(false);
                                  setLlmMatchedProduct(null);
                                  setLiveSimilarProducts([]);
                                  setPurchaseLocId(p.default_location_id);
                                  setPurchaseDueDate(computeDefaultDueDateStr(p));
                                  setPurchasePrintMode(p.label_print_mode);
                                }}
                                className="flex w-full items-center justify-between rounded px-2 py-1 text-left text-xs text-slate-900 dark:text-slate-100 hover:bg-amber-100 dark:hover:bg-amber-500/20"
                              >
                                <span className="font-medium">{p.name}</span>
                                <span className="text-[11px] text-amber-900 dark:text-amber-200">Use existing</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      <HierarchySelect
                        items={effectiveCategories}
                        value={newProdCatId || null}
                        onChange={(v) => {
                          userEditedCatRef.current = true;
                          setNewProdCatId(v || 0);
                        }}
                        placeholder="Select category"
                        ariaLabel="New product category"
                        onCreate={handleCreateCategory}
                        createEntityLabel="category"
                      />
                      <OptionalNumberInput
                        disabled={newProdUseAvg}
                        value={newProdUseAvg ? "" : newProdDueDays}
                        onChange={setNewProdDueDays}
                        placeholder={newProdUseAvg ? "Due days (auto rolling avg)" : "Default due days (optional)"}
                        className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-white disabled:cursor-not-allowed disabled:opacity-50"
                      />
                      <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300">
                        <input
                          type="checkbox"
                          checked={newProdUseAvg}
                          onChange={(e) => setNewProdUseAvg(e.target.checked)}
                        />
                        Use rolling average for due date
                      </label>
                      <div className="sm:col-span-2">
                        <MeasurementFields
                          value={newProdMeasurement}
                          onChange={(next) => {
                            userEditedProdMeasRef.current = true;
                            setNewProdMeasurement(next);
                          }}
                          label="Product Measurement (Optional)"
                          ariaPrefix="Product measurement"
                        />
                      </div>
                    </div>
                  )}

                  <div className={`grid grid-cols-2 gap-3 ${printersEnabled ? "sm:grid-cols-4" : "sm:grid-cols-3"}`}>
                    <label className="block min-w-0 text-xs text-slate-600 dark:text-slate-400">
                      Quantity
                      <NumberInput
                        min={1}
                        required
                        value={purchaseQty}
                        onChange={setPurchaseQty}
                        className="mt-1 h-10 w-full min-w-0 max-w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-1.5 text-sm text-slate-900 dark:text-white"
                      />
                    </label>
                    <div className="block min-w-0 text-xs text-slate-600 dark:text-slate-400">
                      <div className="mb-1">Location</div>
                      <HierarchySelect
                        items={effectiveLocations}
                        value={purchaseLocId || null}
                        onChange={(v) => {
                          setPurchaseLocId(v || 0);
                          setNewProdLocId(v || 0);
                        }}
                        placeholder="Select location"
                        ariaLabel="Purchase location"
                        onCreate={handleCreateLocation}
                        createEntityLabel="location"
                        showFreezerOption
                      />
                    </div>
                    <label className="block min-w-0 text-xs text-slate-600 dark:text-slate-400">
                      Due Date
                      <input
                        type="date"
                        value={purchaseDueDate}
                        onChange={(e) => setPurchaseDueDate(e.target.value)}
                        className="mt-1 block h-10 w-full min-w-0 max-w-full appearance-none rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-1.5 text-sm text-slate-900 dark:text-white"
                      />
                    </label>
                    {printersEnabled && (
                      <label className="block min-w-0 text-xs text-slate-600 dark:text-slate-400">
                        Label Mode
                        <select
                          value={purchasePrintMode}
                          onChange={(e) => setPurchasePrintMode(e.target.value)}
                          className="mt-1 h-10 w-full min-w-0 max-w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-1.5 text-sm text-slate-900 dark:text-white"
                        >
                          <option value="per_item">Per Item</option>
                          <option value="single">Single Label</option>
                          <option value="none">No Label</option>
                        </select>
                      </label>
                    )}
                  </div>

                  {/* Expandable Variant & Pack Details */}
                  <div className="border-t border-slate-200 dark:border-slate-800 pt-2">
                    <button
                      type="button"
                      onClick={() => setShowVariantSection((v) => !v)}
                      className="flex items-center gap-1 text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300"
                    >
                      {showVariantSection ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                      Variant &amp; Barcode Details
                    </button>
                    {showVariantSection && (
                      <div className="mt-2 space-y-2">
                        {scanTarget && (
                          <div className="flex items-center justify-between rounded-lg border border-indigo-200 dark:border-indigo-500/40 bg-indigo-50 dark:bg-indigo-500/15 px-2.5 py-1.5 text-xs text-indigo-800 dark:text-indigo-200">
                            <span>
                              Ready to scan into {scanTarget === "primary_barcode" ? "primary barcode" : "second barcode"}...
                            </span>
                            <button
                              type="button"
                              onClick={() => setScanTarget(null)}
                              className="font-semibold text-indigo-700 dark:text-indigo-300 hover:text-slate-900 dark:hover:text-white"
                            >
                              Cancel
                            </button>
                          </div>
                        )}
                        <input
                          value={variantName}
                          onChange={(e) => setVariantName(e.target.value)}
                          placeholder="Variant name (e.g. 16 oz)"
                          aria-label="Variant name"
                          className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-1.5 text-sm text-slate-900 dark:text-white"
                        />
                        <div className="flex items-center gap-2" data-testid="primary-barcode-row">
                          <div className="relative flex flex-1 items-center">
                            <input
                              value={purchaseBarcode}
                              onChange={(e) => setPurchaseBarcode(e.target.value)}
                              placeholder="Primary barcode"
                              aria-label="Primary barcode"
                              className={`w-full rounded-lg border bg-white dark:bg-slate-950 py-1.5 pl-3 pr-9 text-sm text-slate-900 dark:text-white ${
                                scanTarget === "primary_barcode" ? "border-indigo-500 ring-1 ring-indigo-500" : "border-slate-300 dark:border-slate-700"
                              }`}
                            />
                            <button
                              type="button"
                              aria-label="Scan primary barcode"
                              title="Scan primary barcode"
                              onClick={() => setScanTarget((cur) => (cur === "primary_barcode" ? null : "primary_barcode"))}
                              className={`absolute right-1.5 rounded p-1 ${
                                scanTarget === "primary_barcode"
                                  ? "bg-indigo-600 text-white"
                                  : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-indigo-800 dark:hover:text-indigo-300"
                              }`}
                            >
                              <ScanBarcode className="h-4 w-4" />
                            </button>
                          </div>
                          <NumberInput
                            min={1}
                            value={purchaseBarcodeQty}
                            onChange={setPurchaseBarcodeQty}
                            placeholder="Qty"
                            aria-label="Primary pack quantity"
                            title="Primary pack quantity"
                            className="w-20 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1.5 text-center text-sm text-slate-900 dark:text-white"
                          />
                        </div>
                        <div className="flex items-center gap-2" data-testid="second-barcode-row">
                          <div className="relative flex flex-1 items-center">
                            <input
                              value={secondBarcode}
                              onChange={(e) => setSecondBarcode(e.target.value)}
                              placeholder="Second barcode (optional)"
                              aria-label="Second barcode"
                              className={`w-full rounded-lg border bg-white dark:bg-slate-950 py-1.5 pl-3 pr-9 text-sm text-slate-900 dark:text-white ${
                                scanTarget === "second_barcode" ? "border-indigo-500 ring-1 ring-indigo-500" : "border-slate-300 dark:border-slate-700"
                              }`}
                            />
                            <button
                              type="button"
                              aria-label="Scan second barcode"
                              title="Scan second barcode"
                              onClick={() => setScanTarget((cur) => (cur === "second_barcode" ? null : "second_barcode"))}
                              className={`absolute right-1.5 rounded p-1 ${
                                scanTarget === "second_barcode"
                                  ? "bg-indigo-600 text-white"
                                  : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-indigo-800 dark:hover:text-indigo-300"
                              }`}
                            >
                              <ScanBarcode className="h-4 w-4" />
                            </button>
                          </div>
                          <NumberInput
                            min={1}
                            value={secondBarcodeQty}
                            onChange={setSecondBarcodeQty}
                            placeholder="Qty"
                            aria-label="Second pack quantity"
                            title="Second pack quantity"
                            className="w-20 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1.5 text-center text-sm text-slate-900 dark:text-white"
                          />
                        </div>
                        <MeasurementFields
                          value={variantMeasurement}
                          onChange={(next) => {
                            userEditedVarMeasRef.current = true;
                            setVariantMeasurement(next);
                          }}
                          label="Variant Measurement (Optional)"
                          ariaPrefix="Variant measurement"
                        />
                      </div>
                    )}
                  </div>

                  <button
                    type="submit"
                    disabled={purchaseMissingRequired}
                    className="w-full rounded-lg bg-indigo-600 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 dark:hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Confirm &amp; Add ({purchaseQty})
                  </button>
                </form>
              )}
            </div>
          )}

          {/* MATCHING PRODUCTS (Consume / Open / Transfer) */}
          {actionSearchHits.length > 0 && (mode === "consume" || mode === "open" || mode === "transfer") && (
            <div className="space-y-1.5">
              <div className="text-xs font-medium uppercase tracking-wider text-slate-600 dark:text-slate-400">Matching Products</div>
              {actionSearchHits.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => void loadProductCandidates(p, mode)}
                  className="flex w-full items-center justify-between rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-left text-sm hover:border-indigo-500"
                >
                  <span className="font-medium text-slate-900 dark:text-slate-100">{p.name}</span>
                  <span className="text-xs text-slate-600 dark:text-slate-400">{p.category_name}</span>
                </button>
              ))}
            </div>
          )}

          {/* TRANSFER STAGED LIST & DESTINATION COMPLETION */}
          {mode === "transfer" && (
            <div className="space-y-3">
              <div className="space-y-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 p-3">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-medium uppercase tracking-wider text-slate-600 dark:text-slate-400">
                    Items to Transfer ({transferItems.length})
                  </div>
                  {transferItems.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setTransferItems([])}
                      className="text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                    >
                      Clear
                    </button>
                  )}
                </div>
                {transferItems.length === 0 ? (
                  <p className="text-xs text-slate-600 dark:text-slate-400">
                    Scan item, product, or UPC barcodes to add items to the transfer list.
                  </p>
                ) : (
                  <div className="space-y-1.5" data-testid="transfer-staged-list">
                    {transferItems.map((it) => (
                      <div
                        key={it.id}
                        className="flex items-center justify-between rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
                      >
                        <div className="min-w-0">
                          <div className="truncate font-medium text-slate-900 dark:text-slate-100">
                            {it.product_name}
                            {it.variant_name ? (
                              <span className="ml-1.5 text-xs font-normal text-slate-600 dark:text-slate-400">({it.variant_name})</span>
                            ) : null}
                          </div>
                          <div className="text-xs text-slate-600 dark:text-slate-400">
                            {it.location_name || "No location"} {it.due_on_date ? `• Due ${it.due_on_date}` : ""}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setTransferItems((prev) => prev.filter((x) => x.id !== it.id))}
                          aria-label={`Remove ${it.product_name} #${it.id}`}
                          className="ml-2 rounded p-1 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-rose-700 dark:hover:text-rose-300"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 p-3">
                <div className="text-xs font-medium text-slate-600 dark:text-slate-400">
                  Destination Location (scan location QR or select to complete transfer)
                </div>
                <HierarchySelect
                  items={locations}
                  value={transferDest?.id ?? null}
                  onChange={(v) => setTransferDest(locations.find((l) => l.id === v) || null)}
                  allowEmpty
                  emptyLabel="-- Choose destination --"
                  ariaLabel="Destination location"
                  inlineMenu
                />
                <button
                  type="button"
                  disabled={transferItems.length === 0 || !transferDest}
                  onClick={() => {
                    if (transferDest) {
                      void executeTransfer(transferDest);
                    }
                  }}
                  className="w-full rounded-lg bg-indigo-600 py-2 text-sm font-semibold text-white hover:bg-indigo-700 dark:hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Complete Transfer ({transferItems.length})
                </button>
              </div>
            </div>
          )}

          {/* UNKNOWN BARCODE INLINE ASSOCIATION (Consume/Open) */}
          {unknownBarcodeForAssoc && (mode === "consume" || mode === "open") && (
            <div className="space-y-2 rounded-xl border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 p-3">
              <div className="text-xs font-medium text-amber-900 dark:text-amber-200">
                Link barcode <code>{unknownBarcodeForAssoc}</code> to an existing product:
              </div>
              <div className="flex gap-2">
                <input
                  value={assocQuery}
                  onChange={(e) => setAssocQuery(e.target.value)}
                  placeholder="Search product name..."
                  className="flex-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-1.5 text-sm text-slate-900 dark:text-white"
                />
                <button
                  type="button"
                  onClick={async () => {
                    const r = await apiFetch<{ products: Product[] }>(`/api/products?status=all&q=${encodeURIComponent(assocQuery)}`);
                    setAssocMatches(r.products.slice(0, 5));
                  }}
                  className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white"
                >
                  Find
                </button>
              </div>
              {assocMatches.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => associateUnknownBarcode(p)}
                  className="flex w-full items-center justify-between rounded-lg bg-white dark:bg-slate-900 px-3 py-2 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <span>{p.name}</span>
                  <span className="text-xs text-indigo-600 dark:text-indigo-400">Link</span>
                </button>
              ))}
            </div>
          )}

          {/* ITEM SELECTION LIST (Consume / Open / Transfer) */}
          {candidateItems.length > 0 && mode !== "purchase" && mode !== "inventory" && (
            <div className="space-y-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 p-3">
              <div className="text-xs font-medium uppercase tracking-wider text-slate-600 dark:text-slate-400">
                {candidateHeading || "Select items (soonest due first)"}
              </div>
              {candidateItems.map((it) => {
                const checked = selectedItemIds.includes(it.id);
                const alreadyStaged = mode === "transfer" && transferItems.some((t) => t.id === it.id);
                return (
                  <label key={it.id} className="flex cursor-pointer items-center justify-between rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 px-3 py-2 text-sm">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() =>
                          setSelectedItemIds((prev) =>
                            checked ? prev.filter((x) => x !== it.id) : [...prev, it.id]
                          )
                        }
                      />
                      <div>
                        <div className="font-medium text-slate-900 dark:text-slate-100">
                          {it.product_name}
                          {it.variant_name ? (
                            <span className="ml-1.5 text-xs font-normal text-slate-600 dark:text-slate-400">({it.variant_name})</span>
                          ) : null}
                        </div>
                        <div className="text-xs text-slate-600 dark:text-slate-400">
                          {it.location_name || "No location"} {it.due_on_date ? `• Due ${it.due_on_date}` : ""}
                        </div>
                      </div>
                    </div>
                    {alreadyStaged && (
                      <span className="rounded bg-indigo-50 dark:bg-indigo-500/20 px-1.5 py-0.5 text-[11px] font-medium text-indigo-700 dark:text-indigo-300">
                        In list
                      </span>
                    )}
                  </label>
                );
              })}
              {mode === "transfer" ? (
                <button
                  type="button"
                  disabled={selectedItemIds.length === 0}
                  onClick={addCandidatesToTransfer}
                  className="w-full rounded-lg bg-indigo-600 py-2 text-sm font-semibold text-white hover:bg-indigo-700 dark:hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Add to Transfer List ({selectedItemIds.length})
                </button>
              ) : (
                <button
                  type="button"
                  onClick={applyCandidateItems}
                  className="w-full rounded-lg bg-indigo-600 py-2 text-sm font-semibold text-white hover:bg-indigo-700 dark:hover:bg-indigo-500"
                >
                  Apply {mode} ({selectedItemIds.length})
                </button>
              )}
            </div>
          )}

          {/* INVENTORY AUDIT WORKFLOW */}
          {mode === "inventory" && (
            <div className="space-y-3">
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 p-3">
                <div className="mb-1 text-xs font-medium text-slate-600 dark:text-slate-400">Location to Audit</div>
                <HierarchySelect
                  items={locations}
                  value={invLocation?.id ?? null}
                  onChange={(v) => {
                    const loc = locations.find((l) => l.id === v) || null;
                    setInvLocation(loc);
                    setInvSummary(null);
                    setInvScannedItemIds([]);
                    setInvScannedProducts([]);
                  }}
                  allowEmpty
                  emptyLabel="-- Choose location --"
                  ariaLabel="Audit location"
                  inlineMenu
                />
              </div>

              {invLocation && !invSummary && (
                <div className="space-y-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 p-3">
                  <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-400">
                    <span>Scanned: {invScannedItemIds.length} items, {invScannedProducts.reduce((s, p) => s + p.quantity, 0)} product units</span>
                    <button
                      type="button"
                      onClick={buildInventorySummary}
                      className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 dark:hover:bg-indigo-500"
                    >
                      Review Reconciliation
                    </button>
                  </div>
                  {invScannedProducts.map((sp) => (
                    <div key={sp.product_id} className="flex items-center justify-between rounded bg-white dark:bg-slate-950 px-3 py-1.5 text-sm">
                      <span>{sp.product_name}</span>
                      <NumberInput
                        min={1}
                        value={sp.quantity}
                        onChange={(qty) =>
                          setInvScannedProducts((prev) =>
                            prev.map((x) => (x.product_id === sp.product_id ? { ...x, quantity: qty } : x))
                          )
                        }
                        className="w-16 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-0.5 text-right text-xs"
                      />
                    </div>
                  ))}
                </div>
              )}

              {invSummary && (
                <div className="space-y-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 p-3 text-sm">
                  <h3 className="font-semibold text-slate-900 dark:text-white">Reconciliation Summary</h3>
                  <div>
                    <div className="text-xs font-semibold text-rose-700 dark:text-rose-300">Consume Missing ({invSummary.to_consume.length})</div>
                    {invSummary.to_consume.map((it) => (
                      <label key={it.id} className="mt-1 flex items-center gap-2 text-xs">
                        <input
                          type="checkbox"
                          checked={invConsumeIds.includes(it.id)}
                          onChange={() =>
                            setInvConsumeIds((prev) => (prev.includes(it.id) ? prev.filter((x) => x !== it.id) : [...prev, it.id]))
                          }
                        />
                        <span>{it.product_name} (#{it.id})</span>
                      </label>
                    ))}
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-amber-800 dark:text-amber-300">Transfer Here ({invSummary.to_transfer.length})</div>
                    {invSummary.to_transfer.map((it) => (
                      <label key={it.id} className="mt-1 flex items-center gap-2 text-xs">
                        <input
                          type="checkbox"
                          checked={invTransferIds.includes(it.id)}
                          onChange={() =>
                            setInvTransferIds((prev) => (prev.includes(it.id) ? prev.filter((x) => x !== it.id) : [...prev, it.id]))
                          }
                        />
                        <span>{it.product_name} (from {it.location_name || "unknown"})</span>
                      </label>
                    ))}
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">Confirmed ({invSummary.to_confirm.length})</div>
                  </div>
                  {invSummary.to_create.length > 0 && (
                    <div>
                      <div className="text-xs font-semibold text-indigo-700 dark:text-indigo-300">Create New ({invSummary.to_create.length})</div>
                      {invSummary.to_create.map((c) => (
                        <div key={c.product_id} className="mt-1 flex items-center justify-between gap-2 text-xs">
                          <label className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={Boolean(invCreateMap[c.product_id]?.selected)}
                              onChange={(e) =>
                                setInvCreateMap((prev) => ({
                                  ...prev,
                                  [c.product_id]: { ...prev[c.product_id], selected: e.target.checked },
                                }))
                              }
                            />
                            <span>{c.quantity} × {c.product_name}</span>
                          </label>
                          <input
                            type="date"
                            value={invCreateMap[c.product_id]?.due_on_date || ""}
                            onChange={(e) =>
                              setInvCreateMap((prev) => ({
                                ...prev,
                                [c.product_id]: { ...prev[c.product_id], due_on_date: e.target.value },
                              }))
                            }
                            className="rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-2 py-0.5 text-xs"
                          />
                        </div>
                      ))}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={applyInventoryAudit}
                    className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-emerald-600 py-2 font-semibold text-white hover:bg-emerald-500"
                  >
                    <Check className="h-4 w-4" /> Apply Reconciliation
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </ModalBackdrop>
  );
};

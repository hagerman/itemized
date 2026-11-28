import React, { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { HelpCircle, Printer, RotateCcw, Trash2 } from "lucide-react";
import { apiFetch, LabelTemplate, PrinterRecord } from "../../api";
import { useHelp } from "../HelpContext";
import { CARD_CLASS, INLINE_INPUT_CLASS, LEARN_MORE_CLASS, SettingsFeedbackProps } from "./styles";

export const LabelPrintingPanel: React.FC<SettingsFeedbackProps> = ({
  onFlash,
  onError,
}) => {
  const qc = useQueryClient();
  const { openHelpForScreen } = useHelp();

  const { data: printersData } = useQuery({
    queryKey: ["printers"],
    queryFn: () => apiFetch<{ printers: PrinterRecord[] }>("/api/printers"),
  });
  const [pName, setPName] = useState("");
  const [pDriver, setPDriver] = useState<"ipp_zpl" | "raw_tcp_zpl">("ipp_zpl");
  const [pEndpoint, setPEndpoint] = useState("");

  const { data: tmplData } = useQuery({
    queryKey: ["label-templates"],
    queryFn: () => apiFetch<{ templates: LabelTemplate[] }>("/api/label-templates"),
  });
  const [activeEntity, setActiveEntity] = useState<"item" | "product" | "location">("item");
  const [tmplContent, setTmplContent] = useState("");

  useEffect(() => {
    const found = tmplData?.templates?.find((t) => t.entity_type === activeEntity);
    if (found) setTmplContent(found.content);
  }, [tmplData, activeEntity]);

  return (
    <div className="space-y-6">
      <section className={CARD_CLASS}>
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">Label Printers</h2>
          <button
            type="button"
            data-help-screen="settings/printers"
            onClick={() => openHelpForScreen("settings/printers")}
            className={LEARN_MORE_CLASS}
          >
            <HelpCircle className="h-3.5 w-3.5" /> Learn more
          </button>
        </div>

        <form
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await apiFetch("/api/printers", {
                method: "POST",
                body: JSON.stringify({ name: pName, driver: pDriver, endpoint: pEndpoint, enabled: true }),
              });
              setPName("");
              setPEndpoint("");
              void qc.invalidateQueries({ queryKey: ["printers"] });
              void qc.invalidateQueries({ queryKey: ["auth-status"] });
              onFlash("Printer added.");
            } catch (err) {
              onError(err instanceof Error ? err.message : "Failed to add printer");
            }
          }}
          className="grid grid-cols-1 gap-2 sm:grid-cols-4"
        >
          <input
            required
            value={pName}
            onChange={(e) => setPName(e.target.value)}
            placeholder="Printer name"
            className={INLINE_INPUT_CLASS}
          />
          <select
            value={pDriver}
            onChange={(e) => setPDriver(e.target.value as "ipp_zpl" | "raw_tcp_zpl")}
            className={INLINE_INPUT_CLASS}
          >
            <option value="ipp_zpl">IPP ZPL (Zebra ZSB)</option>
            <option value="raw_tcp_zpl">Raw TCP :9100 ZPL</option>
          </select>
          <input
            required
            value={pEndpoint}
            onChange={(e) => setPEndpoint(e.target.value)}
            placeholder={pDriver === "raw_tcp_zpl" ? "192.168.1.50:9100" : "http://192.168.1.50:631/ipp/print"}
            className={INLINE_INPUT_CLASS}
          />
          <button
            type="submit"
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 dark:hover:bg-indigo-500"
          >
            Add Printer
          </button>
        </form>

        <div className="divide-y divide-slate-200 dark:divide-slate-800">
          {(printersData?.printers || []).map((pr) => (
            <div key={pr.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
              <div>
                <div className="font-medium text-slate-900 dark:text-white">
                  {pr.name} <span className="text-xs text-slate-600 dark:text-slate-400">({pr.driver})</span>
                </div>
                <div className="font-mono text-xs text-slate-600 dark:text-slate-400">{pr.endpoint}</div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await apiFetch(`/api/printers/${pr.id}/test`, { method: "POST" });
                      onFlash(`Test label sent to ${pr.name}`);
                    } catch (err) {
                      onError(err instanceof Error ? err.message : "Test print failed");
                    }
                  }}
                  className="flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  <Printer className="h-3.5 w-3.5" /> Test Print
                </button>
                <button
                  type="button"
                  aria-label={`Delete ${pr.name}`}
                  onClick={async () => {
                    await apiFetch(`/api/printers/${pr.id}`, { method: "DELETE" });
                    void qc.invalidateQueries({ queryKey: ["printers"] });
                    void qc.invalidateQueries({ queryKey: ["auth-status"] });
                  }}
                  className="rounded p-1.5 text-slate-500 hover:bg-rose-50 hover:text-rose-700 dark:text-slate-400 dark:hover:bg-rose-500/20 dark:hover:text-rose-300"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900/60 dark:shadow-none">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">ZPL Label Templates</h2>
            <button
              type="button"
              data-help-screen="settings/label-templates"
              onClick={() => openHelpForScreen("settings/label-templates")}
              className={LEARN_MORE_CLASS}
            >
              <HelpCircle className="h-3.5 w-3.5" /> Learn more
            </button>
          </div>
          <div className="flex gap-1 rounded-lg border border-slate-200 bg-slate-100 p-1 text-xs dark:border-slate-800 dark:bg-slate-950">
            {(["item", "product", "location"] as const).map((et) => (
              <button
                key={et}
                type="button"
                onClick={() => setActiveEntity(et)}
                className={`rounded-md px-3 py-1 capitalize ${
                  activeEntity === et ? "bg-indigo-600 text-white" : "text-slate-600 dark:text-slate-400"
                }`}
              >
                {et}
              </button>
            ))}
          </div>
        </div>
        <div className="text-xs text-slate-600 dark:text-slate-400">
          Variables: <code>.Payload.Barcode</code>, <code>.Payload.ProductName</code>,{" "}
          <code>.Payload.LocationName</code>, <code>.Payload.DueDate</code>, <code>.MediaReady</code>
        </div>
        <textarea
          rows={10}
          value={tmplContent}
          onChange={(e) => setTmplContent(e.target.value)}
          className="w-full rounded-xl border border-slate-300 bg-slate-50 p-3 font-mono text-xs text-slate-800 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
        />
        <div className="flex gap-2">
          <button
            type="button"
            onClick={async () => {
              try {
                await apiFetch(`/api/label-templates/${activeEntity}`, {
                  method: "PUT",
                  body: JSON.stringify({ content: tmplContent }),
                });
                void qc.invalidateQueries({ queryKey: ["label-templates"] });
                onFlash(`Saved custom ${activeEntity} template.`);
              } catch (err) {
                onError(err instanceof Error ? err.message : "Invalid template");
              }
            }}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700 dark:hover:bg-indigo-500"
          >
            Save Template
          </button>
          <button
            type="button"
            onClick={async () => {
              const res = await apiFetch<{ content: string }>(`/api/label-templates/${activeEntity}`, {
                method: "DELETE",
              });
              setTmplContent(res.content);
              void qc.invalidateQueries({ queryKey: ["label-templates"] });
              onFlash(`Reset ${activeEntity} template to built-in default.`);
            }}
            className="flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Reset to Default
          </button>
        </div>
      </section>
    </div>
  );
};

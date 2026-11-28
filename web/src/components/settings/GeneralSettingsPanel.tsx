import React, { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { HelpCircle } from "lucide-react";
import { apiFetch, AppSettings } from "../../api";
import { useHelp } from "../HelpContext";
import { NumberInput } from "../NumberInput";
import { CARD_CLASS, INPUT_CLASS, LEARN_MORE_CLASS, SettingsFeedbackProps } from "./styles";

interface GeneralSettingsPanelProps extends SettingsFeedbackProps {
  settings?: AppSettings;
}

export const GeneralSettingsPanel: React.FC<GeneralSettingsPanelProps> = ({
  settings,
  onFlash,
  onError,
}) => {
  const qc = useQueryClient();
  const { openHelpForScreen } = useHelp();

  const [baseUrl, setBaseUrl] = useState("");
  const [avgCount, setAvgCount] = useState(3);

  useEffect(() => {
    if (!settings) return;
    setBaseUrl(settings.base_url);
    setAvgCount(settings.due_date_average_count);
  }, [settings]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch("/api/settings", {
        method: "PATCH",
        body: JSON.stringify({
          base_url: baseUrl,
          due_date_average_count: Number(avgCount) || 3,
        }),
      });
      void qc.invalidateQueries({ queryKey: ["settings"] });
      onFlash("General settings saved.");
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to save general settings");
    }
  };

  return (
    <form onSubmit={handleSave} className={CARD_CLASS}>
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">Instance Configuration</h2>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Configure your public URL for printed QR labels and default due-date averaging.
          </p>
        </div>
        <button
          type="button"
          data-help-screen="settings/instance"
          onClick={() => openHelpForScreen("settings/instance")}
          className={LEARN_MORE_CLASS}
        >
          <HelpCircle className="h-3.5 w-3.5" /> Learn more
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="block text-xs text-slate-600 dark:text-slate-400">
          Base URL (encoded in QR labels)
          <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} className={INPUT_CLASS} />
        </label>
        <label className="block text-xs text-slate-600 dark:text-slate-400">
          Due Date Rolling Average Count
          <NumberInput min={1} fallback={3} required value={avgCount} onChange={setAvgCount} className={INPUT_CLASS} />
        </label>
      </div>

      <button
        type="submit"
        className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 dark:hover:bg-indigo-500"
      >
        Save General Settings
      </button>
    </form>
  );
};

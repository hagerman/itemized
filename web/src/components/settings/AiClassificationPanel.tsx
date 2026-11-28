import React, { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { HelpCircle } from "lucide-react";
import { apiFetch, AppSettings } from "../../api";
import { useHelp } from "../HelpContext";
import { CARD_CLASS, INLINE_INPUT_CLASS, LEARN_MORE_CLASS, SettingsFeedbackProps } from "./styles";

interface AiClassificationPanelProps extends SettingsFeedbackProps {
  settings?: AppSettings;
}

export const AiClassificationPanel: React.FC<AiClassificationPanelProps> = ({
  settings,
  demoMode = false,
  onFlash,
  onError,
}) => {
  const qc = useQueryClient();
  const { openHelpForScreen } = useHelp();

  const [llmProvider, setLlmProvider] = useState("");
  const [llmModel, setLlmModel] = useState("");
  const [llmBaseUrl, setLlmBaseUrl] = useState("");
  const [llmApiKey, setLlmApiKey] = useState("");

  useEffect(() => {
    if (!settings) return;
    setLlmProvider(settings.llm_provider);
    setLlmModel(settings.llm_model);
    setLlmBaseUrl(settings.llm_base_url);
  }, [settings]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch("/api/settings", {
        method: "PATCH",
        body: JSON.stringify({
          llm_provider: llmProvider,
          llm_model: llmModel,
          llm_base_url: llmBaseUrl,
          ...(llmApiKey ? { llm_api_key: llmApiKey } : {}),
        }),
      });
      setLlmApiKey("");
      void qc.invalidateQueries({ queryKey: ["settings"] });
      void qc.invalidateQueries({ queryKey: ["auth-status"] });
      onFlash("AI classification settings saved.");
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to save AI classification settings");
    }
  };

  return (
    <form onSubmit={handleSave} className={CARD_CLASS}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">LLM Product Classification (Optional)</h2>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Normalize scanned UPC product names and enable bulk reclassification with an LLM provider.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {demoMode && <span className="text-xs text-amber-700 dark:text-amber-300">Disabled in demo mode</span>}
          <button
            type="button"
            data-help-screen="settings/llm"
            onClick={() => openHelpForScreen("settings/llm")}
            className={LEARN_MORE_CLASS}
          >
            <HelpCircle className="h-3.5 w-3.5" /> Learn more
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <select
          disabled={demoMode}
          aria-label="LLM Provider"
          value={llmProvider}
          onChange={(e) => setLlmProvider(e.target.value)}
          className={INLINE_INPUT_CLASS}
        >
          <option value="">Disabled</option>
          <option value="anthropic">Anthropic</option>
          <option value="openai">OpenAI</option>
          <option value="gemini">Gemini</option>
          <option value="openai-compatible">OpenAI-Compatible (Ollama)</option>
        </select>
        <input
          disabled={demoMode}
          value={llmModel}
          onChange={(e) => setLlmModel(e.target.value)}
          placeholder="Model name"
          className={INLINE_INPUT_CLASS}
        />
        <input
          disabled={demoMode}
          value={llmBaseUrl}
          onChange={(e) => setLlmBaseUrl(e.target.value)}
          placeholder="Base URL (optional)"
          className={INLINE_INPUT_CLASS}
        />
        <input
          disabled={demoMode}
          type="password"
          value={llmApiKey}
          onChange={(e) => setLlmApiKey(e.target.value)}
          placeholder={settings?.llm_has_api_key ? "API key saved" : "API Key"}
          className={INLINE_INPUT_CLASS}
        />
      </div>

      <button
        type="submit"
        disabled={demoMode}
        className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-indigo-500"
      >
        Save AI Settings
      </button>
    </form>
  );
};

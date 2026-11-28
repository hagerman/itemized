import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, HelpCircle, KeyRound, Trash2 } from "lucide-react";
import { apiFetch, APIToken } from "../../api";
import { useHelp } from "../HelpContext";
import { CARD_CLASS, INLINE_INPUT_CLASS, LEARN_MORE_CLASS, SettingsFeedbackProps } from "./styles";

export const ApiTokensPanel: React.FC<SettingsFeedbackProps> = ({
  demoMode = false,
  onFlash,
  onError,
}) => {
  const qc = useQueryClient();
  const { openHelpForScreen } = useHelp();

  const { data: tokensData } = useQuery({
    queryKey: ["api-tokens"],
    queryFn: () => apiFetch<{ tokens: APIToken[] }>("/api/auth/tokens"),
    enabled: !demoMode,
  });

  const [tokenName, setTokenName] = useState("");
  const [tokenExpiresDays, setTokenExpiresDays] = useState<string>("");
  const [creatingToken, setCreatingToken] = useState(false);
  const [revealedToken, setRevealedToken] = useState<{ name: string; token: string } | null>(null);
  const [copiedToken, setCopiedToken] = useState(false);

  const handleCreateToken = async (e: React.FormEvent) => {
    e.preventDefault();
    if (demoMode || creatingToken) return;
    setCreatingToken(true);
    setCopiedToken(false);
    try {
      const payload: { name: string; expires_in_days?: number } = { name: tokenName.trim() };
      if (tokenExpiresDays) {
        payload.expires_in_days = Number(tokenExpiresDays);
      }
      const res = await apiFetch<{ token: string; metadata: APIToken }>("/api/auth/tokens", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setRevealedToken({ name: res.metadata.name, token: res.token });
      setTokenName("");
      setTokenExpiresDays("");
      void qc.invalidateQueries({ queryKey: ["api-tokens"] });
      onFlash(`API token "${res.metadata.name}" created.`);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to create API token");
    } finally {
      setCreatingToken(false);
    }
  };

  const handleRevokeToken = async (token: APIToken) => {
    if (demoMode) return;
    try {
      await apiFetch(`/api/auth/tokens/${token.id}`, { method: "DELETE" });
      void qc.invalidateQueries({ queryKey: ["api-tokens"] });
      onFlash(`API token "${token.name}" revoked.`);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to revoke API token");
    }
  };

  const handleCopyToken = async () => {
    if (!revealedToken) return;
    try {
      await navigator.clipboard?.writeText(revealedToken.token);
      setCopiedToken(true);
      window.setTimeout(() => setCopiedToken(false), 2000);
    } catch {
      // Fallback: user can still copy from the input manually
    }
  };

  return (
    <section className={CARD_CLASS}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">API Tokens</h2>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Create long-lived Bearer tokens for Home Assistant, iOS Shortcuts, and scripts.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {demoMode && <span className="text-xs text-amber-700 dark:text-amber-300">Disabled in demo mode</span>}
          <button
            type="button"
            data-help-screen="settings/api-tokens"
            onClick={() => openHelpForScreen("settings/api-tokens")}
            className={LEARN_MORE_CLASS}
          >
            <HelpCircle className="h-3.5 w-3.5" /> Learn more
          </button>
        </div>
      </div>

      <form onSubmit={handleCreateToken} className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <input
          required
          disabled={demoMode || creatingToken}
          value={tokenName}
          onChange={(e) => setTokenName(e.target.value)}
          placeholder="Token name (e.g. Home Assistant)"
          aria-label="Token name"
          className={INLINE_INPUT_CLASS}
        />
        <select
          disabled={demoMode || creatingToken}
          value={tokenExpiresDays}
          onChange={(e) => setTokenExpiresDays(e.target.value)}
          aria-label="Token expiration"
          className={INLINE_INPUT_CLASS}
        >
          <option value="">Never expires</option>
          <option value="30">Expires in 30 days</option>
          <option value="90">Expires in 90 days</option>
          <option value="365">Expires in 1 year</option>
        </select>
        <button
          type="submit"
          disabled={demoMode || creatingToken}
          className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 dark:hover:bg-indigo-500"
        >
          <KeyRound className="h-4 w-4" />
          {creatingToken ? "Creating..." : "Create Token"}
        </button>
      </form>

      {revealedToken && (
        <div
          data-testid="api-token-reveal"
          className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-3.5 dark:border-amber-500/40 dark:bg-amber-500/10"
        >
          <div className="flex items-center justify-between gap-2 text-xs font-semibold text-amber-900 dark:text-amber-200">
            <span>Copy &ldquo;{revealedToken.name}&rdquo; now — you won&apos;t be able to see it again.</span>
            <button
              type="button"
              onClick={() => setRevealedToken(null)}
              className="text-xs font-medium underline hover:text-amber-700 dark:hover:text-white"
            >
              Dismiss
            </button>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              readOnly
              aria-label="Created API token"
              value={revealedToken.token}
              onFocus={(e) => e.currentTarget.select()}
              className="min-w-0 flex-1 rounded-lg border border-amber-300 bg-white px-3 py-1.5 font-mono text-xs text-slate-900 dark:border-amber-500/40 dark:bg-slate-950 dark:text-amber-100"
            />
            <button
              type="button"
              onClick={() => void handleCopyToken()}
              className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 dark:hover:bg-amber-500"
            >
              {copiedToken ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copiedToken ? "Copied" : "Copy"}
            </button>
          </div>
        </div>
      )}

      {!demoMode && (
        <div className="divide-y divide-slate-200 rounded-xl border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
          {(tokensData?.tokens || []).length === 0 ? (
            <div className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
              No personal API tokens yet.
            </div>
          ) : (
            (tokensData?.tokens || []).map((t) => (
              <div key={t.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-xs">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-900 dark:text-white">{t.name}</span>
                    <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                      {t.token_prefix}...
                    </code>
                  </div>
                  <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                    Created {t.created_at.slice(0, 10)}
                    {" · "}
                    Last used {t.last_used_at ? t.last_used_at.slice(0, 10) : "never"}
                    {" · "}
                    {t.expires_at ? `Expires ${t.expires_at.slice(0, 10)}` : "Never expires"}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void handleRevokeToken(t)}
                  aria-label={`Revoke ${t.name}`}
                  className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-medium text-rose-700 hover:bg-rose-100 dark:border-rose-500/30 dark:bg-rose-500/15 dark:text-rose-200 dark:hover:bg-rose-500/25"
                >
                  <Trash2 className="h-3 w-3" /> Revoke
                </button>
              </div>
            ))
          )}
        </div>
      )}
    </section>
  );
};

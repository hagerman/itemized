import React, { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { HelpCircle, Monitor, Moon, Printer, RotateCcw, Sun, Trash2 } from "lucide-react";
import { apiFetch, AppSettings, AuthStatus, LabelTemplate, PrinterRecord, ThemePreference, User } from "../api";
import { useHelp } from "../components/HelpContext";
import { NumberInput } from "../components/NumberInput";
import { useTheme } from "../components/ThemeContext";

interface SettingsPageProps {
  user: User;
  demoMode?: boolean;
}

const THEME_OPTIONS: Array<{ value: ThemePreference; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { value: "system", label: "System", icon: Monitor },
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
];

const CARD_CLASS = "space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900/60 dark:shadow-none";
const INPUT_CLASS = "mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-600 focus:outline-none disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:placeholder:text-slate-500";
const INLINE_INPUT_CLASS = "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-600 focus:outline-none disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:placeholder:text-slate-500";
const LEARN_MORE_CLASS = "inline-flex items-center gap-1 text-xs font-medium text-indigo-700 hover:text-indigo-800 hover:underline dark:text-indigo-300 dark:hover:text-indigo-200";

export const SettingsPage: React.FC<SettingsPageProps> = ({ user, demoMode = false }) => {
  const qc = useQueryClient();
  const { openHelpForScreen } = useHelp();
  const { preference, setPreference } = useTheme();
  const isAdmin = user.role === "admin";
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savingTheme, setSavingTheme] = useState(false);
  const [quickActionsEnabled, setQuickActionsEnabled] = useState(user.quick_actions_enabled !== false);
  const [savingQuickActions, setSavingQuickActions] = useState(false);

  // Account (All users)
  const [accountEmail, setAccountEmail] = useState(user.email);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");

  useEffect(() => {
    setAccountEmail(user.email);
  }, [user.email]);

  useEffect(() => {
    setQuickActionsEnabled(user.quick_actions_enabled !== false);
  }, [user.quick_actions_enabled]);

  // Instance Settings (Admin only)
  const { data: settings } = useQuery({
    queryKey: ["settings"],
    queryFn: () => apiFetch<AppSettings>("/api/settings"),
    enabled: isAdmin,
  });
  const [baseUrl, setBaseUrl] = useState("");
  const [avgCount, setAvgCount] = useState(3);
  const [oidcIssuer, setOidcIssuer] = useState("");
  const [oidcClientId, setOidcClientId] = useState("");
  const [oidcClientSecret, setOidcClientSecret] = useState("");
  const [oidcAutoProv, setOidcAutoProv] = useState(false);
  const [oidcForce, setOidcForce] = useState(false);
  const [llmProvider, setLlmProvider] = useState("");
  const [llmModel, setLlmModel] = useState("");
  const [llmBaseUrl, setLlmBaseUrl] = useState("");
  const [llmApiKey, setLlmApiKey] = useState("");

  const oidcConfigured = oidcIssuer.trim() !== "" && oidcClientId.trim() !== "";

  useEffect(() => {
    if (!settings) return;
    setBaseUrl(settings.base_url);
    setAvgCount(settings.due_date_average_count);
    setOidcIssuer(settings.oidc_issuer);
    setOidcClientId(settings.oidc_client_id);
    setOidcAutoProv(settings.oidc_auto_provision);
    setOidcForce(settings.oidc_force);
    setLlmProvider(settings.llm_provider);
    setLlmModel(settings.llm_model);
    setLlmBaseUrl(settings.llm_base_url);
  }, [settings]);

  // Users (Admin only)
  const { data: usersData } = useQuery({
    queryKey: ["users"],
    queryFn: () => apiFetch<{ users: User[] }>("/api/users"),
    enabled: isAdmin,
  });
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserPass, setNewUserPass] = useState("");
  const [newUserRole, setNewUserRole] = useState<"member" | "admin">("member");

  // Printers (Admin only)
  const { data: printersData } = useQuery({
    queryKey: ["printers"],
    queryFn: () => apiFetch<{ printers: PrinterRecord[] }>("/api/printers"),
    enabled: isAdmin,
  });
  const [pName, setPName] = useState("");
  const [pDriver, setPDriver] = useState<"ipp_zpl" | "raw_tcp_zpl">("ipp_zpl");
  const [pEndpoint, setPEndpoint] = useState("");

  // Label Templates (Admin only)
  const { data: tmplData } = useQuery({
    queryKey: ["label-templates"],
    queryFn: () => apiFetch<{ templates: LabelTemplate[] }>("/api/label-templates"),
    enabled: isAdmin,
  });
  const [activeEntity, setActiveEntity] = useState<"item" | "product" | "location">("item");
  const [tmplContent, setTmplContent] = useState("");

  useEffect(() => {
    const found = tmplData?.templates?.find((t) => t.entity_type === activeEntity);
    if (found) setTmplContent(found.content);
  }, [tmplData, activeEntity]);

  const flash = (msg: string) => {
    setError(null);
    setNotice(msg);
  };

  const handleSelectTheme = async (next: ThemePreference) => {
    if (next === preference || savingTheme) return;
    const previous = preference;
    setPreference(next);
    if (demoMode) {
      flash("Theme updated locally for this browser.");
      return;
    }
    setSavingTheme(true);
    try {
      const res = await apiFetch<{ user: User }>("/api/auth/account", {
        method: "PATCH",
        body: JSON.stringify({ theme: next }),
      });
      qc.setQueryData<AuthStatus>(["auth-status"], (prev) =>
        prev ? { ...prev, user: res.user ?? (prev.user ? { ...prev.user, theme: next } : null) } : prev
      );
      flash("Theme preference saved.");
    } catch (err) {
      setPreference(previous);
      setNotice(null);
      setError(err instanceof Error ? err.message : "Failed to save theme preference");
    } finally {
      setSavingTheme(false);
    }
  };

  const handleToggleQuickActions = async (next: boolean) => {
    if (savingQuickActions) return;
    const previous = quickActionsEnabled;
    setQuickActionsEnabled(next);
    if (demoMode) {
      qc.setQueryData<AuthStatus>(["auth-status"], (prev) =>
        prev && prev.user ? { ...prev, user: { ...prev.user, quick_actions_enabled: next } } : prev
      );
      flash("Quick actions preference updated locally for this session.");
      return;
    }
    setSavingQuickActions(true);
    try {
      const res = await apiFetch<{ user: User }>("/api/auth/account", {
        method: "PATCH",
        body: JSON.stringify({ quick_actions_enabled: next }),
      });
      qc.setQueryData<AuthStatus>(["auth-status"], (prev) =>
        prev ? { ...prev, user: res.user ?? (prev.user ? { ...prev.user, quick_actions_enabled: next } : null) } : prev
      );
      flash("Quick actions preference saved.");
    } catch (err) {
      setQuickActionsEnabled(previous);
      setNotice(null);
      setError(err instanceof Error ? err.message : "Failed to save quick actions preference");
    } finally {
      setSavingQuickActions(false);
    }
  };

  const saveAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch("/api/auth/account", {
        method: "PATCH",
        body: JSON.stringify({
          email: accountEmail,
          ...(newPassword ? { current_password: currentPassword, new_password: newPassword } : {}),
        }),
      });
      setCurrentPassword("");
      setNewPassword("");
      flash("Account updated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update account");
    }
  };

  const saveInstanceSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch("/api/settings", {
        method: "PATCH",
        body: JSON.stringify({
          base_url: baseUrl,
          due_date_average_count: Number(avgCount) || 3,
          oidc_issuer: oidcIssuer,
          oidc_client_id: oidcClientId,
          ...(oidcClientSecret ? { oidc_client_secret: oidcClientSecret } : {}),
          oidc_auto_provision: oidcConfigured && oidcAutoProv ? "true" : "false",
          oidc_force: oidcConfigured && oidcForce ? "true" : "false",
          llm_provider: llmProvider,
          llm_model: llmModel,
          llm_base_url: llmBaseUrl,
          ...(llmApiKey ? { llm_api_key: llmApiKey } : {}),
        }),
      });
      setOidcClientSecret("");
      setLlmApiKey("");
      void qc.invalidateQueries({ queryKey: ["settings"] });
      void qc.invalidateQueries({ queryKey: ["auth-status"] });
      flash("Settings saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save settings");
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {demoMode && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/15 dark:text-amber-200">
          Demo mode is active: Account changes, OIDC, LLM configuration, and outbound printer connections are disabled.
        </div>
      )}
      {notice && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800 dark:border-emerald-500/40 dark:bg-emerald-500/15 dark:text-emerald-200">
          {notice}
        </div>
      )}
      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm text-rose-800 dark:border-rose-500/40 dark:bg-rose-500/15 dark:text-rose-200">
          {error}
        </div>
      )}

      {/* Account (All Users) */}
      <form onSubmit={saveAccount} className={CARD_CLASS}>
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">Account</h2>
          <div className="flex items-center gap-3">
            {demoMode && <span className="text-xs text-amber-700 dark:text-amber-300">Disabled in demo mode</span>}
            <button
              type="button"
              data-help-screen="settings/account"
              onClick={() => openHelpForScreen("settings/account")}
              className={LEARN_MORE_CLASS}
            >
              <HelpCircle className="h-3.5 w-3.5" /> Learn more
            </button>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="block text-xs text-slate-600 dark:text-slate-400">
            Email address
            <input type="email" required disabled={demoMode} value={accountEmail} onChange={(e) => setAccountEmail(e.target.value)} className={INPUT_CLASS} />
          </label>
          <label className="block text-xs text-slate-600 dark:text-slate-400">
            Current password
            <input type="password" disabled={demoMode} value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} placeholder="Required to change password" className={INPUT_CLASS} />
          </label>
          <label className="block text-xs text-slate-600 dark:text-slate-400">
            New password
            <input type="password" disabled={demoMode} minLength={newPassword ? 8 : undefined} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Leave blank to keep current" className={INPUT_CLASS} />
          </label>
        </div>
        <button type="submit" disabled={demoMode} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 dark:hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50">
          Update Account
        </button>
      </form>

      {/* Appearance (All Users) */}
      <section className={CARD_CLASS}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">Appearance</h2>
            <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">
              {demoMode
                ? "Choose a theme for this browser. Changes apply locally in this demo session."
                : "Choose how itemized looks. System automatically follows your device's light or dark setting."}
            </p>
          </div>
          <div
            role="radiogroup"
            aria-label="Theme mode"
            className="inline-grid grid-cols-3 gap-1 rounded-xl border border-slate-200 bg-slate-100 p-1 dark:border-slate-800 dark:bg-slate-950"
          >
            {THEME_OPTIONS.map((opt) => {
              const Icon = opt.icon;
              const selected = preference === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  disabled={savingTheme}
                  onClick={() => void handleSelectTheme(opt.value)}
                  className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                    selected
                      ? "bg-white text-slate-900 shadow-xs dark:bg-indigo-600 dark:text-white dark:shadow-none"
                      : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  <span>{opt.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4 dark:border-slate-800">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">Quick Actions</h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Show one-tap Consume buttons on the inventory list. Disable if you scan printed item labels to mark specific units.
            </p>
          </div>
          <div
            role="radiogroup"
            aria-label="Quick actions"
            className="inline-grid grid-cols-2 gap-1 rounded-xl border border-slate-200 bg-slate-100 p-1 dark:border-slate-800 dark:bg-slate-950"
          >
            {[
              { value: true, label: "Enabled" },
              { value: false, label: "Disabled" },
            ].map((opt) => {
              const selected = quickActionsEnabled === opt.value;
              return (
                <button
                  key={opt.label}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  disabled={savingQuickActions}
                  onClick={() => {
                    if (opt.value !== quickActionsEnabled) {
                      void handleToggleQuickActions(opt.value);
                    }
                  }}
                  className={`inline-flex items-center justify-center rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                    selected
                      ? "bg-white text-slate-900 shadow-xs dark:bg-indigo-600 dark:text-white dark:shadow-none"
                      : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                  }`}
                >
                  <span>{opt.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* Instance Configuration (Admin Only) */}
      {isAdmin && (
        <form onSubmit={saveInstanceSettings} className={CARD_CLASS}>
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">Instance Configuration</h2>
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

          <div className="border-t border-slate-200 pt-4 dark:border-slate-800">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">OIDC (Optional)</h3>
              <div className="flex items-center gap-3">
                {demoMode && <span className="text-xs text-amber-700 dark:text-amber-300">Disabled in demo mode</span>}
                <button
                  type="button"
                  data-help-screen="settings/oidc"
                  onClick={() => openHelpForScreen("settings/oidc")}
                  className={LEARN_MORE_CLASS}
                >
                  <HelpCircle className="h-3.5 w-3.5" /> Learn more
                </button>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <input disabled={demoMode} value={oidcIssuer} onChange={(e) => setOidcIssuer(e.target.value)} placeholder="Issuer URL" className={INLINE_INPUT_CLASS} />
              <input disabled={demoMode} value={oidcClientId} onChange={(e) => setOidcClientId(e.target.value)} placeholder="Client ID" className={INLINE_INPUT_CLASS} />
              <input disabled={demoMode} type="password" value={oidcClientSecret} onChange={(e) => setOidcClientSecret(e.target.value)} placeholder={settings?.oidc_has_secret ? "Secret saved (leave blank)" : "Client Secret"} className={INLINE_INPUT_CLASS} />
            </div>
            <label className={`mt-2 flex items-center gap-2 text-xs ${!demoMode && oidcConfigured ? "text-slate-700 dark:text-slate-300" : "text-slate-400 dark:text-slate-500"}`}>
              <input
                type="checkbox"
                checked={!demoMode && oidcConfigured && oidcAutoProv}
                disabled={demoMode || !oidcConfigured}
                onChange={(e) => setOidcAutoProv(e.target.checked)}
              />
              Auto-provision new household members on OIDC login
            </label>
            <label className={`mt-2 flex items-center gap-2 text-xs ${!demoMode && oidcConfigured ? "text-slate-700 dark:text-slate-300" : "text-slate-400 dark:text-slate-500"}`}>
              <input
                type="checkbox"
                checked={!demoMode && oidcConfigured && oidcForce}
                disabled={demoMode || !oidcConfigured}
                onChange={(e) => setOidcForce(e.target.checked)}
              />
              Force OIDC login (disable local password sign-in)
            </label>
          </div>

          <div className="border-t border-slate-200 pt-4 dark:border-slate-800">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">LLM Product Classification (Optional)</h3>
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
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
              <select disabled={demoMode} value={llmProvider} onChange={(e) => setLlmProvider(e.target.value)} className={INLINE_INPUT_CLASS}>
                <option value="">Disabled</option>
                <option value="anthropic">Anthropic</option>
                <option value="openai">OpenAI</option>
                <option value="gemini">Gemini</option>
                <option value="openai-compatible">OpenAI-Compatible (Ollama)</option>
              </select>
              <input disabled={demoMode} value={llmModel} onChange={(e) => setLlmModel(e.target.value)} placeholder="Model name" className={INLINE_INPUT_CLASS} />
              <input disabled={demoMode} value={llmBaseUrl} onChange={(e) => setLlmBaseUrl(e.target.value)} placeholder="Base URL (optional)" className={INLINE_INPUT_CLASS} />
              <input disabled={demoMode} type="password" value={llmApiKey} onChange={(e) => setLlmApiKey(e.target.value)} placeholder={settings?.llm_has_api_key ? "API key saved" : "API Key"} className={INLINE_INPUT_CLASS} />
            </div>
          </div>

          <button type="submit" className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 dark:hover:bg-indigo-500">
            Save Settings
          </button>
        </form>
      )}

      {/* Household Users (Admin Only) */}
      {isAdmin && (
        <div className={CARD_CLASS}>
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">Household Users (Admin)</h2>
            <button
              type="button"
              data-help-screen="settings/users"
              onClick={() => openHelpForScreen("settings/users")}
              className={LEARN_MORE_CLASS}
            >
              <HelpCircle className="h-3.5 w-3.5" /> Learn more
            </button>
          </div>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await apiFetch("/api/users", {
                  method: "POST",
                  body: JSON.stringify({ email: newUserEmail, password: newUserPass, role: newUserRole }),
                });
                setNewUserEmail("");
                setNewUserPass("");
                void qc.invalidateQueries({ queryKey: ["users"] });
                flash("User created.");
              } catch (err) {
                setError(err instanceof Error ? err.message : "Failed to create user");
              }
            }}
            className="grid grid-cols-1 gap-2 sm:grid-cols-4"
          >
            <input required type="email" value={newUserEmail} onChange={(e) => setNewUserEmail(e.target.value)} placeholder="Email" className={INLINE_INPUT_CLASS} />
            <input required type="password" minLength={8} value={newUserPass} onChange={(e) => setNewUserPass(e.target.value)} placeholder="Temp password (8+)" className={INLINE_INPUT_CLASS} />
            <select value={newUserRole} onChange={(e) => setNewUserRole(e.target.value as "member" | "admin")} className={INLINE_INPUT_CLASS}>
              <option value="member">Member</option>
              <option value="admin">Admin</option>
            </select>
            <button type="submit" className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 dark:hover:bg-indigo-500">Add User</button>
          </form>

          <div className="divide-y divide-slate-200 dark:divide-slate-800">
            {(usersData?.users || []).map((u) => (
              <div key={u.id} className="flex items-center justify-between gap-2 py-2.5 text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-slate-900 dark:text-slate-100">{u.email}</span>
                  {u.id === user.id && (
                    <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-400">{u.role} (you)</span>
                  )}
                </div>
                {u.id !== user.id && (
                  <div className="flex items-center gap-2">
                    <select
                      aria-label={`Role for ${u.email}`}
                      value={u.role}
                      onChange={async (e) => {
                        const nextRole = e.target.value as "member" | "admin";
                        try {
                          await apiFetch(`/api/users/${u.id}`, {
                            method: "PATCH",
                            body: JSON.stringify({ role: nextRole }),
                          });
                          void qc.invalidateQueries({ queryKey: ["users"] });
                          flash(`Updated role for ${u.email} to ${nextRole}.`);
                        } catch (err) {
                          setError(err instanceof Error ? err.message : "Failed to update user role");
                        }
                      }}
                      className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                    >
                      <option value="member">member</option>
                      <option value="admin">admin</option>
                    </select>
                    <button
                      type="button"
                      aria-label={`Delete ${u.email}`}
                      onClick={async () => {
                        await apiFetch(`/api/users/${u.id}`, { method: "DELETE" });
                        void qc.invalidateQueries({ queryKey: ["users"] });
                      }}
                      className="rounded p-1.5 text-slate-500 hover:bg-rose-50 hover:text-rose-700 dark:text-slate-400 dark:hover:bg-rose-500/20 dark:hover:text-rose-300"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Printers (Admin Only) */}
      {isAdmin && (
        <div className={CARD_CLASS}>
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
                flash("Printer added.");
              } catch (err) {
                setError(err instanceof Error ? err.message : "Failed to add printer");
              }
            }}
            className="grid grid-cols-1 gap-2 sm:grid-cols-4"
          >
            <input required value={pName} onChange={(e) => setPName(e.target.value)} placeholder="Printer name" className={INLINE_INPUT_CLASS} />
            <select value={pDriver} onChange={(e) => setPDriver(e.target.value as "ipp_zpl" | "raw_tcp_zpl")} className={INLINE_INPUT_CLASS}>
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
            <button type="submit" className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 dark:hover:bg-indigo-500">Add Printer</button>
          </form>

          <div className="divide-y divide-slate-200 dark:divide-slate-800">
            {(printersData?.printers || []).map((pr) => (
              <div key={pr.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                <div>
                  <div className="font-medium text-slate-900 dark:text-white">{pr.name} <span className="text-xs text-slate-600 dark:text-slate-400">({pr.driver})</span></div>
                  <div className="font-mono text-xs text-slate-600 dark:text-slate-400">{pr.endpoint}</div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await apiFetch(`/api/printers/${pr.id}/test`, { method: "POST" });
                        flash(`Test label sent to ${pr.name}`);
                      } catch (err) {
                        setError(err instanceof Error ? err.message : "Test print failed");
                      }
                    }}
                    className="flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                  >
                    <Printer className="h-3.5 w-3.5" /> Test Print
                  </button>
                  <button
                    type="button"
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
        </div>
      )}

      {/* ZPL Label Templates (Admin Only) */}
      {isAdmin && (
        <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900/60 dark:shadow-none">
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
                  className={`rounded-md px-3 py-1 capitalize ${activeEntity === et ? "bg-indigo-600 text-white" : "text-slate-600 dark:text-slate-400"}`}
                >
                  {et}
                </button>
              ))}
            </div>
          </div>
          <div className="text-xs text-slate-600 dark:text-slate-400">
            Variables: <code>.Payload.Barcode</code>, <code>.Payload.ProductName</code>, <code>.Payload.LocationName</code>, <code>.Payload.DueDate</code>, <code>.MediaReady</code>
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
                  flash(`Saved custom ${activeEntity} template.`);
                } catch (err) {
                  setError(err instanceof Error ? err.message : "Invalid template");
                }
              }}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700 dark:hover:bg-indigo-500"
            >
              Save Template
            </button>
            <button
              type="button"
              onClick={async () => {
                const res = await apiFetch<{ content: string }>(`/api/label-templates/${activeEntity}`, { method: "DELETE" });
                setTmplContent(res.content);
                void qc.invalidateQueries({ queryKey: ["label-templates"] });
                flash(`Reset ${activeEntity} template to built-in default.`);
              }}
              className="flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Reset to Default
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

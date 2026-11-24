import React, { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Printer, RotateCcw, Trash2 } from "lucide-react";
import { apiFetch, AppSettings, LabelTemplate, PrinterRecord, User } from "../api";

interface SettingsPageProps {
  user: User;
}

export const SettingsPage: React.FC<SettingsPageProps> = ({ user }) => {
  const qc = useQueryClient();
  const isAdmin = user.role === "admin";
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Account (All users)
  const [accountEmail, setAccountEmail] = useState(user.email);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");

  useEffect(() => {
    setAccountEmail(user.email);
  }, [user.email]);

  // Instance Settings (Admin only)
  const { data: settings } = useQuery({
    queryKey: ["settings"],
    queryFn: () => apiFetch<AppSettings>("/api/settings"),
    enabled: isAdmin,
  });
  const [baseUrl, setBaseUrl] = useState("");
  const [avgCount, setAvgCount] = useState("3");
  const [oidcIssuer, setOidcIssuer] = useState("");
  const [oidcClientId, setOidcClientId] = useState("");
  const [oidcClientSecret, setOidcClientSecret] = useState("");
  const [oidcAutoProv, setOidcAutoProv] = useState(false);
  const [llmProvider, setLlmProvider] = useState("");
  const [llmModel, setLlmModel] = useState("");
  const [llmBaseUrl, setLlmBaseUrl] = useState("");
  const [llmApiKey, setLlmApiKey] = useState("");

  useEffect(() => {
    if (!settings) return;
    setBaseUrl(settings.base_url);
    setAvgCount(String(settings.due_date_average_count));
    setOidcIssuer(settings.oidc_issuer);
    setOidcClientId(settings.oidc_client_id);
    setOidcAutoProv(settings.oidc_auto_provision);
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
          oidc_auto_provision: oidcAutoProv ? "true" : "false",
          llm_provider: llmProvider,
          llm_model: llmModel,
          llm_base_url: llmBaseUrl,
          ...(llmApiKey ? { llm_api_key: llmApiKey } : {}),
        }),
      });
      setOidcClientSecret("");
      setLlmApiKey("");
      void qc.invalidateQueries({ queryKey: ["settings"] });
      flash("Settings saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save settings");
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {notice && <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/15 px-4 py-2.5 text-sm text-emerald-200">{notice}</div>}
      {error && <div className="rounded-xl border border-rose-500/40 bg-rose-500/15 px-4 py-2.5 text-sm text-rose-200">{error}</div>}

      {/* Account (All Users) */}
      <form onSubmit={saveAccount} className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
        <h2 className="text-base font-semibold text-white">Account</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="block text-xs text-slate-400">
            Email address
            <input type="email" required value={accountEmail} onChange={(e) => setAccountEmail(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white" />
          </label>
          <label className="block text-xs text-slate-400">
            Current password
            <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} placeholder="Required to change password" className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white" />
          </label>
          <label className="block text-xs text-slate-400">
            New password
            <input type="password" minLength={newPassword ? 8 : undefined} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Leave blank to keep current" className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white" />
          </label>
        </div>
        <button type="submit" className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500">Update Account</button>
      </form>

      {/* Instance Configuration (Admin Only) */}
      {isAdmin && (
      <form onSubmit={saveInstanceSettings} className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
        <h2 className="text-base font-semibold text-white">Instance Configuration</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block text-xs text-slate-400">
            Base URL (encoded in QR labels)
            <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white" />
          </label>
          <label className="block text-xs text-slate-400">
            Due Date Rolling Average Count
            <input type="number" min={1} value={avgCount} onChange={(e) => setAvgCount(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white" />
          </label>
        </div>

        <div className="border-t border-slate-800 pt-4">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">OIDC (Optional)</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <input value={oidcIssuer} onChange={(e) => setOidcIssuer(e.target.value)} placeholder="Issuer URL" className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white" />
            <input value={oidcClientId} onChange={(e) => setOidcClientId(e.target.value)} placeholder="Client ID" className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white" />
            <input type="password" value={oidcClientSecret} onChange={(e) => setOidcClientSecret(e.target.value)} placeholder={settings?.oidc_has_secret ? "Secret saved (leave blank)" : "Client Secret"} className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white" />
          </div>
          <label className="mt-2 flex items-center gap-2 text-xs text-slate-300">
            <input type="checkbox" checked={oidcAutoProv} onChange={(e) => setOidcAutoProv(e.target.checked)} />
            Auto-provision new household members on OIDC login
          </label>
        </div>

        <div className="border-t border-slate-800 pt-4">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">LLM Product Classification (Optional)</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            <select value={llmProvider} onChange={(e) => setLlmProvider(e.target.value)} className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white">
              <option value="">Disabled</option>
              <option value="anthropic">Anthropic</option>
              <option value="openai">OpenAI</option>
              <option value="gemini">Gemini</option>
              <option value="openai-compatible">OpenAI-Compatible (Ollama)</option>
            </select>
            <input value={llmModel} onChange={(e) => setLlmModel(e.target.value)} placeholder="Model name" className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white" />
            <input value={llmBaseUrl} onChange={(e) => setLlmBaseUrl(e.target.value)} placeholder="Base URL (optional)" className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white" />
            <input type="password" value={llmApiKey} onChange={(e) => setLlmApiKey(e.target.value)} placeholder={settings?.llm_has_api_key ? "API key saved" : "API Key"} className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white" />
          </div>
        </div>

        <button type="submit" className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500">Save Settings</button>
      </form>
      )}

      {/* Household Users (Admin Only) */}
      {isAdmin && (
        <div className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
          <h2 className="text-base font-semibold text-white">Household Users (Admin)</h2>
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
            <input required type="email" value={newUserEmail} onChange={(e) => setNewUserEmail(e.target.value)} placeholder="Email" className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white" />
            <input required type="password" minLength={8} value={newUserPass} onChange={(e) => setNewUserPass(e.target.value)} placeholder="Temp password (8+)" className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white" />
            <select value={newUserRole} onChange={(e) => setNewUserRole(e.target.value as "member" | "admin")} className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white">
              <option value="member">Member</option>
              <option value="admin">Admin</option>
            </select>
            <button type="submit" className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white">Add User</button>
          </form>

          <div className="divide-y divide-slate-800">
            {(usersData?.users || []).map((u) => (
              <div key={u.id} className="flex items-center justify-between py-2.5 text-sm">
                <div>
                  <span className="text-slate-100">{u.email}</span>
                  <span className="ml-2 rounded bg-slate-800 px-2 py-0.5 text-xs text-slate-400">{u.role}</span>
                </div>
                {u.id !== user.id && (
                  <button
                    type="button"
                    onClick={async () => {
                      await apiFetch(`/api/users/${u.id}`, { method: "DELETE" });
                      void qc.invalidateQueries({ queryKey: ["users"] });
                    }}
                    className="rounded p-1.5 text-slate-400 hover:bg-rose-500/20 hover:text-rose-300"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Printers (Admin Only) */}
      {isAdmin && (
      <div className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
        <h2 className="text-base font-semibold text-white">Label Printers</h2>
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
              flash("Printer added.");
            } catch (err) {
              setError(err instanceof Error ? err.message : "Failed to add printer");
            }
          }}
          className="grid grid-cols-1 gap-2 sm:grid-cols-4"
        >
          <input required value={pName} onChange={(e) => setPName(e.target.value)} placeholder="Printer name" className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white" />
          <select value={pDriver} onChange={(e) => setPDriver(e.target.value as "ipp_zpl" | "raw_tcp_zpl")} className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white">
            <option value="ipp_zpl">IPP ZPL (Zebra ZSB)</option>
            <option value="raw_tcp_zpl">Raw TCP :9100 ZPL</option>
          </select>
          <input
            required
            value={pEndpoint}
            onChange={(e) => setPEndpoint(e.target.value)}
            placeholder={pDriver === "raw_tcp_zpl" ? "192.168.1.50:9100" : "http://192.168.1.50:631/ipp/print"}
            className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
          />
          <button type="submit" className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white">Add Printer</button>
        </form>

        <div className="divide-y divide-slate-800">
          {(printersData?.printers || []).map((pr) => (
            <div key={pr.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
              <div>
                <div className="font-medium text-white">{pr.name} <span className="text-xs text-slate-400">({pr.driver})</span></div>
                <div className="font-mono text-xs text-slate-400">{pr.endpoint}</div>
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
                  className="flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1 text-xs text-slate-200 hover:bg-slate-700"
                >
                  <Printer className="h-3.5 w-3.5" /> Test Print
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    await apiFetch(`/api/printers/${pr.id}`, { method: "DELETE" });
                    void qc.invalidateQueries({ queryKey: ["printers"] });
                  }}
                  className="rounded p-1.5 text-slate-400 hover:bg-rose-500/20 hover:text-rose-300"
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
      <div className="space-y-3 rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-white">ZPL Label Templates</h2>
          <div className="flex gap-1 rounded-lg bg-slate-950 p-1 text-xs">
            {(["item", "product", "location"] as const).map((et) => (
              <button
                key={et}
                type="button"
                onClick={() => setActiveEntity(et)}
                className={`rounded-md px-3 py-1 capitalize ${activeEntity === et ? "bg-indigo-600 text-white" : "text-slate-400"}`}
              >
                {et}
              </button>
            ))}
          </div>
        </div>
        <div className="text-xs text-slate-400">
          Variables: <code>.Payload.Barcode</code>, <code>.Payload.ProductName</code>, <code>.Payload.LocationName</code>, <code>.Payload.DueDate</code>, <code>.MediaReady</code>
        </div>
        <textarea
          rows={10}
          value={tmplContent}
          onChange={(e) => setTmplContent(e.target.value)}
          className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3 font-mono text-xs text-slate-200"
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
            className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-500"
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
            className="flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-slate-200 hover:bg-slate-700"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Reset to Default
          </button>
        </div>
      </div>
      )}
    </div>
  );
};

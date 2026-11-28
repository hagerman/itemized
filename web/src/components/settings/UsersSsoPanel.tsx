import React, { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { HelpCircle, Trash2 } from "lucide-react";
import { apiFetch, AppSettings, User } from "../../api";
import { useHelp } from "../HelpContext";
import { CARD_CLASS, INLINE_INPUT_CLASS, LEARN_MORE_CLASS, SettingsFeedbackProps } from "./styles";

interface UsersSsoPanelProps extends SettingsFeedbackProps {
  user: User;
  settings?: AppSettings;
}

export const UsersSsoPanel: React.FC<UsersSsoPanelProps> = ({
  user,
  settings,
  demoMode = false,
  onFlash,
  onError,
}) => {
  const qc = useQueryClient();
  const { openHelpForScreen } = useHelp();

  const { data: usersData } = useQuery({
    queryKey: ["users"],
    queryFn: () => apiFetch<{ users: User[] }>("/api/users"),
  });

  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserPass, setNewUserPass] = useState("");
  const [newUserRole, setNewUserRole] = useState<"member" | "admin">("member");

  const [oidcIssuer, setOidcIssuer] = useState("");
  const [oidcClientId, setOidcClientId] = useState("");
  const [oidcClientSecret, setOidcClientSecret] = useState("");
  const [oidcAutoProv, setOidcAutoProv] = useState(false);
  const [oidcForce, setOidcForce] = useState(false);

  const oidcConfigured = oidcIssuer.trim() !== "" && oidcClientId.trim() !== "";

  useEffect(() => {
    if (!settings) return;
    setOidcIssuer(settings.oidc_issuer);
    setOidcClientId(settings.oidc_client_id);
    setOidcAutoProv(settings.oidc_auto_provision);
    setOidcForce(settings.oidc_force);
  }, [settings]);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch("/api/users", {
        method: "POST",
        body: JSON.stringify({ email: newUserEmail, password: newUserPass, role: newUserRole }),
      });
      setNewUserEmail("");
      setNewUserPass("");
      void qc.invalidateQueries({ queryKey: ["users"] });
      onFlash("User created.");
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to create user");
    }
  };

  const handleSaveOidc = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch("/api/settings", {
        method: "PATCH",
        body: JSON.stringify({
          oidc_issuer: oidcIssuer,
          oidc_client_id: oidcClientId,
          ...(oidcClientSecret ? { oidc_client_secret: oidcClientSecret } : {}),
          oidc_auto_provision: oidcConfigured && oidcAutoProv ? "true" : "false",
          oidc_force: oidcConfigured && oidcForce ? "true" : "false",
        }),
      });
      setOidcClientSecret("");
      void qc.invalidateQueries({ queryKey: ["settings"] });
      void qc.invalidateQueries({ queryKey: ["auth-status"] });
      onFlash("OIDC settings saved.");
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to save OIDC settings");
    }
  };

  return (
    <div className="space-y-6">
      <section className={CARD_CLASS}>
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">Household Users</h2>
          <button
            type="button"
            data-help-screen="settings/users"
            onClick={() => openHelpForScreen("settings/users")}
            className={LEARN_MORE_CLASS}
          >
            <HelpCircle className="h-3.5 w-3.5" /> Learn more
          </button>
        </div>

        <form onSubmit={handleCreateUser} className="grid grid-cols-1 gap-2 sm:grid-cols-4">
          <input
            required
            type="email"
            value={newUserEmail}
            onChange={(e) => setNewUserEmail(e.target.value)}
            placeholder="Email"
            className={INLINE_INPUT_CLASS}
          />
          <input
            required
            type="password"
            minLength={8}
            value={newUserPass}
            onChange={(e) => setNewUserPass(e.target.value)}
            placeholder="Temp password (8+)"
            className={INLINE_INPUT_CLASS}
          />
          <select
            value={newUserRole}
            onChange={(e) => setNewUserRole(e.target.value as "member" | "admin")}
            className={INLINE_INPUT_CLASS}
          >
            <option value="member">Member</option>
            <option value="admin">Admin</option>
          </select>
          <button
            type="submit"
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 dark:hover:bg-indigo-500"
          >
            Add User
          </button>
        </form>

        <div className="divide-y divide-slate-200 dark:divide-slate-800">
          {(usersData?.users || []).map((u) => (
            <div key={u.id} className="flex items-center justify-between gap-2 py-2.5 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-slate-900 dark:text-slate-100">{u.email}</span>
                {u.id === user.id && (
                  <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                    {u.role} (you)
                  </span>
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
                        onFlash(`Updated role for ${u.email} to ${nextRole}.`);
                      } catch (err) {
                        onError(err instanceof Error ? err.message : "Failed to update user role");
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
                      try {
                        await apiFetch(`/api/users/${u.id}`, { method: "DELETE" });
                        void qc.invalidateQueries({ queryKey: ["users"] });
                        onFlash(`Deleted ${u.email}.`);
                      } catch (err) {
                        onError(err instanceof Error ? err.message : "Failed to delete user");
                      }
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
      </section>

      <form onSubmit={handleSaveOidc} className={CARD_CLASS}>
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">OIDC Single Sign-On (Optional)</h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Connect an OpenID Connect provider such as Authentik, Authelia, Pocket ID, or Keycloak.
            </p>
          </div>
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
          <input
            disabled={demoMode}
            value={oidcIssuer}
            onChange={(e) => setOidcIssuer(e.target.value)}
            placeholder="Issuer URL"
            className={INLINE_INPUT_CLASS}
          />
          <input
            disabled={demoMode}
            value={oidcClientId}
            onChange={(e) => setOidcClientId(e.target.value)}
            placeholder="Client ID"
            className={INLINE_INPUT_CLASS}
          />
          <input
            disabled={demoMode}
            type="password"
            value={oidcClientSecret}
            onChange={(e) => setOidcClientSecret(e.target.value)}
            placeholder={settings?.oidc_has_secret ? "Secret saved (leave blank)" : "Client Secret"}
            className={INLINE_INPUT_CLASS}
          />
        </div>

        <div className="space-y-2">
          <label
            className={`flex items-center gap-2 text-xs ${
              !demoMode && oidcConfigured ? "text-slate-700 dark:text-slate-300" : "text-slate-400 dark:text-slate-500"
            }`}
          >
            <input
              type="checkbox"
              checked={!demoMode && oidcConfigured && oidcAutoProv}
              disabled={demoMode || !oidcConfigured}
              onChange={(e) => setOidcAutoProv(e.target.checked)}
            />
            Auto-provision new household members on OIDC login
          </label>
          <label
            className={`flex items-center gap-2 text-xs ${
              !demoMode && oidcConfigured ? "text-slate-700 dark:text-slate-300" : "text-slate-400 dark:text-slate-500"
            }`}
          >
            <input
              type="checkbox"
              checked={!demoMode && oidcConfigured && oidcForce}
              disabled={demoMode || !oidcConfigured}
              onChange={(e) => setOidcForce(e.target.checked)}
            />
            Force OIDC login (disable local password sign-in)
          </label>
        </div>

        <button
          type="submit"
          disabled={demoMode}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-indigo-500"
        >
          Save OIDC Settings
        </button>
      </form>
    </div>
  );
};

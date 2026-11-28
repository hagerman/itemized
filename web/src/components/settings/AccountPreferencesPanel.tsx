import React, { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { HelpCircle, Monitor, Moon, Sun } from "lucide-react";
import { apiFetch, AuthStatus, ThemePreference, User } from "../../api";
import { useHelp } from "../HelpContext";
import { useTheme } from "../ThemeContext";
import { CARD_CLASS, INPUT_CLASS, LEARN_MORE_CLASS, SettingsFeedbackProps } from "./styles";

interface AccountPreferencesPanelProps extends SettingsFeedbackProps {
  user: User;
}

const THEME_OPTIONS: Array<{
  value: ThemePreference;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { value: "system", label: "System", icon: Monitor },
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
];

export const AccountPreferencesPanel: React.FC<AccountPreferencesPanelProps> = ({
  user,
  demoMode = false,
  onFlash,
  onError,
}) => {
  const qc = useQueryClient();
  const { openHelpForScreen } = useHelp();
  const { preference, setPreference } = useTheme();

  const [accountEmail, setAccountEmail] = useState(user.email);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [savingTheme, setSavingTheme] = useState(false);
  const [quickActionsEnabled, setQuickActionsEnabled] = useState(user.quick_actions_enabled !== false);
  const [savingQuickActions, setSavingQuickActions] = useState(false);

  useEffect(() => {
    setAccountEmail(user.email);
  }, [user.email]);

  useEffect(() => {
    setQuickActionsEnabled(user.quick_actions_enabled !== false);
  }, [user.quick_actions_enabled]);

  const handleSelectTheme = async (next: ThemePreference) => {
    if (next === preference || savingTheme) return;
    const previous = preference;
    setPreference(next);
    if (demoMode) {
      onFlash("Theme updated locally for this browser.");
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
      onFlash("Theme preference saved.");
    } catch (err) {
      setPreference(previous);
      onError(err instanceof Error ? err.message : "Failed to save theme preference");
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
      onFlash("Quick actions preference updated locally for this session.");
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
      onFlash("Quick actions preference saved.");
    } catch (err) {
      setQuickActionsEnabled(previous);
      onError(err instanceof Error ? err.message : "Failed to save quick actions preference");
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
      onFlash("Account updated.");
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to update account");
    }
  };

  return (
    <div className="space-y-6">
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
            <input
              type="email"
              required
              disabled={demoMode}
              value={accountEmail}
              onChange={(e) => setAccountEmail(e.target.value)}
              className={INPUT_CLASS}
            />
          </label>
          <label className="block text-xs text-slate-600 dark:text-slate-400">
            Current password
            <input
              type="password"
              disabled={demoMode}
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="Required to change password"
              className={INPUT_CLASS}
            />
          </label>
          <label className="block text-xs text-slate-600 dark:text-slate-400">
            New password
            <input
              type="password"
              disabled={demoMode}
              minLength={newPassword ? 8 : undefined}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Leave blank to keep current"
              className={INPUT_CLASS}
            />
          </label>
        </div>
        <button
          type="submit"
          disabled={demoMode}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 dark:hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Update Account
        </button>
      </form>

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
    </div>
  );
};

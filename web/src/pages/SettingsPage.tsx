import React, { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Bell, KeyRound, Printer, SlidersHorizontal, Sparkles, User as UserIcon, Users } from "lucide-react";
import { apiFetch, AppSettings, User } from "../api";
import { NotificationsCard } from "../components/NotificationsCard";
import { SectionNavGroup, SectionNavItem, SectionNavLayout } from "../components/SectionNavLayout";
import { AccountPreferencesPanel } from "../components/settings/AccountPreferencesPanel";
import { AiClassificationPanel } from "../components/settings/AiClassificationPanel";
import { ApiTokensPanel } from "../components/settings/ApiTokensPanel";
import { GeneralSettingsPanel } from "../components/settings/GeneralSettingsPanel";
import { LabelPrintingPanel } from "../components/settings/LabelPrintingPanel";
import { UsersSsoPanel } from "../components/settings/UsersSsoPanel";

export type SettingsTabId =
  | "account"
  | "notifications"
  | "api-tokens"
  | "general"
  | "users-sso"
  | "ai"
  | "printing";

const PERSONAL_ITEMS: SectionNavItem[] = [
  { id: "account", label: "Account & Preferences", icon: UserIcon },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "api-tokens", label: "API Tokens", icon: KeyRound },
];

const ADMIN_ITEMS: SectionNavItem[] = [
  { id: "general", label: "General", icon: SlidersHorizontal },
  { id: "users-sso", label: "Users & SSO", icon: Users },
  { id: "ai", label: "AI & Classification", icon: Sparkles },
  { id: "printing", label: "Label Printing", icon: Printer },
];

interface SettingsPageProps {
  user: User;
  demoMode?: boolean;
}

export const SettingsPage: React.FC<SettingsPageProps> = ({ user, demoMode = false }) => {
  const isAdmin = user.role === "admin";
  const [searchParams, setSearchParams] = useSearchParams();
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const navGroups: SectionNavGroup[] = useMemo(() => {
    const groups: SectionNavGroup[] = [{ id: "personal", label: "Personal", items: PERSONAL_ITEMS }];
    if (isAdmin) {
      groups.push({ id: "admin", label: "Admin", items: ADMIN_ITEMS });
    }
    return groups;
  }, [isAdmin]);

  const visibleTabIds = useMemo(
    () => new Set(navGroups.flatMap((g) => g.items.map((item) => item.id))),
    [navGroups]
  );

  const requestedTab = searchParams.get("tab") as SettingsTabId | null;
  const activeTab: SettingsTabId =
    requestedTab && visibleTabIds.has(requestedTab) ? requestedTab : "account";

  const { data: settings } = useQuery({
    queryKey: ["settings"],
    queryFn: () => apiFetch<AppSettings>("/api/settings"),
    enabled: isAdmin,
  });

  const flash = (msg: string) => {
    setError(null);
    setNotice(msg);
  };

  const reportError = (msg: string) => {
    setNotice(null);
    setError(msg);
  };

  const selectTab = (tabId: string) => {
    setNotice(null);
    setError(null);
    const next = new URLSearchParams(searchParams);
    if (tabId === "account") {
      next.delete("tab");
    } else {
      next.set("tab", tabId);
    }
    setSearchParams(next);
  };

  return (
    <SectionNavLayout
      groups={navGroups}
      activeId={activeTab}
      onSelect={selectTab}
      navAriaLabel="Settings navigation"
      mobileSelectLabel="Settings section"
    >
      {demoMode && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/15 dark:text-amber-200">
          Demo mode is active: Account changes, Push Notifications, API Tokens, OIDC, LLM configuration, and outbound printer connections are disabled.
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

      {activeTab === "account" && (
        <AccountPreferencesPanel user={user} demoMode={demoMode} onFlash={flash} onError={reportError} />
      )}

      {activeTab === "notifications" && (
        <NotificationsCard demoMode={demoMode} onFlash={flash} onError={reportError} />
      )}

      {activeTab === "api-tokens" && (
        <ApiTokensPanel demoMode={demoMode} onFlash={flash} onError={reportError} />
      )}

      {isAdmin && activeTab === "general" && (
        <GeneralSettingsPanel settings={settings} demoMode={demoMode} onFlash={flash} onError={reportError} />
      )}

      {isAdmin && activeTab === "users-sso" && (
        <UsersSsoPanel user={user} settings={settings} demoMode={demoMode} onFlash={flash} onError={reportError} />
      )}

      {isAdmin && activeTab === "ai" && (
        <AiClassificationPanel settings={settings} demoMode={demoMode} onFlash={flash} onError={reportError} />
      )}

      {isAdmin && activeTab === "printing" && (
        <LabelPrintingPanel demoMode={demoMode} onFlash={flash} onError={reportError} />
      )}
    </SectionNavLayout>
  );
};

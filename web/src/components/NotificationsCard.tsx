import React, { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, BellRing, Send, Smartphone, Trash2 } from "lucide-react";
import {
  apiFetch,
  NotificationConfig,
  NotificationDeliveryResult,
  NotificationPreferences,
  NotificationTarget,
} from "../api";

interface NotificationsCardProps {
  demoMode?: boolean;
  onFlash: (msg: string) => void;
  onError: (msg: string) => void;
}

const CARD_CLASS =
  "space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900/60 dark:shadow-none";
const INPUT_CLASS =
  "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-600 focus:outline-none disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950 dark:text-white";

export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function arrayBufferToBase64Url(buf: ArrayBuffer | null): string {
  if (!buf) return "";
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function detectPushEnvironment(): {
  isSecureContext: boolean;
  isIOSNeedsHomeScreen: boolean;
  isSupported: boolean;
  defaultLabel: string;
} {
  const ua = typeof navigator !== "undefined" ? navigator.userAgent || "" : "";
  const isIOS = /iPad|iPhone|iPod/i.test(ua) || (ua.includes("Mac") && typeof document !== "undefined" && "ontouchend" in document);
  const isStandalone =
    (typeof window !== "undefined" && window.matchMedia?.("(display-mode: standalone)").matches) ||
    (typeof navigator !== "undefined" && Boolean((navigator as Navigator & { standalone?: boolean }).standalone));
  const isSecureContext = typeof window !== "undefined" ? window.isSecureContext !== false : true;
  const hasPushAPIs =
    typeof navigator !== "undefined" &&
    "serviceWorker" in navigator &&
    typeof window !== "undefined" &&
    "PushManager" in window &&
    "Notification" in window;

  const isIOSNeedsHomeScreen = isIOS && !isStandalone && !hasPushAPIs;

  let defaultLabel = "Web Browser";
  if (/iPhone/i.test(ua)) defaultLabel = "iPhone";
  else if (/iPad/i.test(ua)) defaultLabel = "iPad";
  else if (/Android/i.test(ua)) defaultLabel = "Android Device";
  else if (/Mac/i.test(ua)) defaultLabel = "Mac Browser";
  else if (/Windows/i.test(ua)) defaultLabel = "Windows Browser";
  else if (/Linux/i.test(ua)) defaultLabel = "Linux Browser";

  return {
    isSecureContext,
    isIOSNeedsHomeScreen,
    isSupported: isSecureContext && hasPushAPIs,
    defaultLabel,
  };
}

export const NotificationsCard: React.FC<NotificationsCardProps> = ({ demoMode = false, onFlash, onError }) => {
  const qc = useQueryClient();
  const env = detectPushEnvironment();

  const { data: config } = useQuery({
    queryKey: ["notifications-config"],
    queryFn: () => apiFetch<NotificationConfig>("/api/notifications/config"),
    enabled: !demoMode,
  });

  const { data: prefs } = useQuery({
    queryKey: ["notifications-preferences"],
    queryFn: () => apiFetch<NotificationPreferences>("/api/notifications/preferences"),
    enabled: !demoMode,
  });

  const { data: targetsData } = useQuery({
    queryKey: ["notifications-targets"],
    queryFn: () => apiFetch<{ targets: NotificationTarget[] }>("/api/notifications/targets"),
    enabled: !demoMode,
  });

  const [digestTime, setDigestTime] = useState("08:30");
  const [expirationEnabled, setExpirationEnabled] = useState(false);
  const [shoppingListEnabled, setShoppingListEnabled] = useState(false);
  const [enrolling, setEnrolling] = useState(false);
  const [savingPrefs, setSavingPrefs] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    if (!prefs) return;
    setDigestTime(prefs.digest_time);
    setExpirationEnabled(prefs.expiration_enabled);
    setShoppingListEnabled(prefs.shopping_list_enabled);
  }, [prefs]);

  const targets = targetsData?.targets || [];
  const serverTimezone = prefs?.timezone || config?.timezone || "Local";

  const handleEnrollDevice = async () => {
    if (demoMode || enrolling || !env.isSupported) return;
    setEnrolling(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        onError("Notification permission was not granted by this browser.");
        return;
      }

      const vapidKey =
        config?.vapid_public_key || (await apiFetch<NotificationConfig>("/api/notifications/config")).vapid_public_key;
      if (!vapidKey) {
        onError("Push notifications are not configured on the server.");
        return;
      }

      const registration =
        (await navigator.serviceWorker.getRegistration("/")) || (await navigator.serviceWorker.register("/sw.js"));
      await navigator.serviceWorker.ready;

      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidKey) as unknown as BufferSource,
        });
      }

      const p256dh = arrayBufferToBase64Url(subscription.getKey("p256dh"));
      const auth = arrayBufferToBase64Url(subscription.getKey("auth"));

      await apiFetch<NotificationTarget>("/api/notifications/targets", {
        method: "POST",
        body: JSON.stringify({
          channel: "web_push",
          label: env.defaultLabel,
          endpoint: subscription.endpoint,
          p256dh,
          auth,
        }),
      });
      void qc.invalidateQueries({ queryKey: ["notifications-targets"] });
      onFlash(`Push notifications enabled on ${env.defaultLabel}.`);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to enable push notifications");
    } finally {
      setEnrolling(false);
    }
  };

  const handleRemoveTarget = async (target: NotificationTarget) => {
    if (demoMode) return;
    try {
      await apiFetch(`/api/notifications/targets/${target.id}`, { method: "DELETE" });
      void qc.invalidateQueries({ queryKey: ["notifications-targets"] });
      onFlash(`Removed "${target.label || "Device"}" from push notifications.`);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to remove device");
    }
  };

  const handleSendTest = async () => {
    if (demoMode || testing) return;
    setTesting(true);
    try {
      const res = await apiFetch<NotificationDeliveryResult>("/api/notifications/test", { method: "POST" });
      void qc.invalidateQueries({ queryKey: ["notifications-targets"] });
      if (res.sent > 0) {
        onFlash(`Test notification sent to ${res.sent} device${res.sent === 1 ? "" : "s"}.`);
      } else {
        onError(`Test notification failed (${res.failed} failed, ${res.pruned} stale removed).`);
      }
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to send test notification");
    } finally {
      setTesting(false);
    }
  };

  const handleSavePreferences = async (e: React.FormEvent) => {
    e.preventDefault();
    if (demoMode || savingPrefs) return;
    setSavingPrefs(true);
    try {
      await apiFetch<NotificationPreferences>("/api/notifications/preferences", {
        method: "PATCH",
        body: JSON.stringify({
          digest_time: digestTime,
          expiration_enabled: expirationEnabled,
          shopping_list_enabled: shoppingListEnabled,
        }),
      });
      void qc.invalidateQueries({ queryKey: ["notifications-preferences"] });
      onFlash("Notification preferences saved.");
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to save notification preferences");
    } finally {
      setSavingPrefs(false);
    }
  };

  return (
    <section className={CARD_CLASS}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">Push Notifications</h2>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
            Receive daily PWA push digests for expiring items and your shopping list on iOS, Android, and desktop.
          </p>
        </div>
        {demoMode && <span className="text-xs text-amber-700 dark:text-amber-300">Disabled in demo mode</span>}
      </div>

      {!demoMode && !env.isSecureContext && (
        <div
          role="note"
          className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200"
        >
          HTTPS is required by browsers to enroll a device for PWA push notifications. Serve itemized over HTTPS (for
          example via a reverse proxy, Tailscale HTTPS, or Cloudflare Tunnel) to enable notifications on this device.
        </div>
      )}

      {!demoMode && env.isSecureContext && env.isIOSNeedsHomeScreen && (
        <div
          role="note"
          className="rounded-xl border border-indigo-200 bg-indigo-50 px-3.5 py-2.5 text-xs text-indigo-900 dark:border-indigo-500/40 dark:bg-indigo-500/10 dark:text-indigo-200"
        >
          On iOS, tap <strong>Share → Add to Home Screen</strong> and open itemized from your Home Screen icon to enable
          push notifications.
        </div>
      )}

      {!demoMode && env.isSecureContext && !env.isIOSNeedsHomeScreen && !env.isSupported && (
        <div
          role="note"
          className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-300"
        >
          This browser does not support Web Push notifications.
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2.5">
        <button
          type="button"
          disabled={demoMode || !env.isSupported || enrolling}
          onClick={() => void handleEnrollDevice()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 dark:hover:bg-indigo-500"
        >
          <BellRing className="h-3.5 w-3.5" />
          {enrolling ? "Enabling..." : "Enable on This Device"}
        </button>

        <button
          type="button"
          disabled={demoMode || targets.length === 0 || testing}
          onClick={() => void handleSendTest()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          <Send className="h-3.5 w-3.5" />
          {testing ? "Sending..." : "Send Test Notification"}
        </button>
      </div>

      {!demoMode && (
        <div className="divide-y divide-slate-200 rounded-xl border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
          {targets.length === 0 ? (
            <div className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">No devices enrolled yet.</div>
          ) : (
            targets.map((t) => (
              <div key={t.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-xs">
                <div className="flex min-w-0 items-center gap-2.5">
                  <Smartphone className="h-4 w-4 shrink-0 text-slate-400" />
                  <div className="min-w-0">
                    <div className="font-semibold text-slate-900 dark:text-white">{t.label || "Web Push Device"}</div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">
                      Added {t.created_at.slice(0, 10)}
                      {t.last_used_at ? ` · Last sent ${t.last_used_at.slice(0, 10)}` : ""}
                    </div>
                    {t.last_error && (
                      <div className="mt-0.5 text-[11px] text-rose-600 dark:text-rose-400">{t.last_error}</div>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void handleRemoveTarget(t)}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:border-rose-300 hover:text-rose-700 dark:border-slate-700 dark:text-slate-300 dark:hover:border-rose-500/50 dark:hover:text-rose-300"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Remove
                </button>
              </div>
            ))
          )}
        </div>
      )}

      <form onSubmit={handleSavePreferences} className="space-y-3 border-t border-slate-200 pt-4 dark:border-slate-800">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          <Bell className="h-3.5 w-3.5" />
          Daily Digest Schedule
        </div>

        <label className="flex items-start gap-2.5 text-sm text-slate-800 dark:text-slate-200">
          <input
            type="checkbox"
            disabled={demoMode}
            checked={expirationEnabled}
            onChange={(e) => setExpirationEnabled(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
          />
          <span>
            <span className="font-medium">Expiring &amp; Overdue Items</span>
            <span className="block text-xs text-slate-500 dark:text-slate-400">
              Daily summary of items expiring soon or already overdue (skipped when none).
            </span>
          </span>
        </label>

        <label className="flex items-start gap-2.5 text-sm text-slate-800 dark:text-slate-200">
          <input
            type="checkbox"
            disabled={demoMode}
            checked={shoppingListEnabled}
            onChange={(e) => setShoppingListEnabled(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
          />
          <span>
            <span className="font-medium">Shopping List / Low Stock</span>
            <span className="block text-xs text-slate-500 dark:text-slate-400">
              Separate daily notification when products are on your shopping list (skipped when empty).
            </span>
          </span>
        </label>

        <div className="flex flex-wrap items-end gap-3 pt-1">
          <div>
            <label htmlFor="digest-time" className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              Daily send time
            </label>
            <input
              id="digest-time"
              type="time"
              disabled={demoMode}
              value={digestTime}
              onChange={(e) => setDigestTime(e.target.value)}
              className={`mt-1 ${INPUT_CLASS}`}
            />
            <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">Server timezone: {serverTimezone}</p>
          </div>
          <button
            type="submit"
            disabled={demoMode || savingPrefs}
            className="mb-5 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50 dark:bg-indigo-600 dark:hover:bg-indigo-500"
          >
            {savingPrefs ? "Saving..." : "Save Digest Preferences"}
          </button>
        </div>
      </form>
    </section>
  );
};

// Minimal Service Worker for Itemized Web Push notifications.
// Intentionally omits fetch interception to avoid stale SPA caching.

self.addEventListener("push", (event) => {
  let payload = {
    title: "Itemized",
    body: "You have an inventory update.",
    url: "/",
    tag: "itemized-notification",
  };

  if (event.data) {
    try {
      const parsed = event.data.json();
      payload = {
        title: parsed.title || payload.title,
        body: parsed.body || payload.body,
        url: parsed.url || payload.url,
        tag: parsed.tag || payload.tag,
      };
    } catch {
      const text = event.data.text();
      if (text) {
        payload.body = text;
      }
    }
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: payload.tag,
      data: { url: payload.url },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) {
          const navigatePromise =
            "navigate" in client && typeof client.navigate === "function"
              ? client.navigate(targetUrl).catch(() => client)
              : Promise.resolve(client);
          return navigatePromise.then((c) => (c && "focus" in c ? c.focus() : client.focus()));
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
      return undefined;
    })
  );
});

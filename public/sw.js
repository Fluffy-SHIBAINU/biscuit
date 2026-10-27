// Biscuit service worker: install, web push, notification taps. No content is stored here.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (e) => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; } catch { data = { title: "Biscuit", body: e.data ? e.data.text() : "" }; }
  const title = data.title || "Biscuit";
  const options = { body: data.body || "", icon: "/icon.svg", badge: "/icon.svg", tag: data.kind || "biscuit", renotify: true, data: { url: data.url || "/", eventId: data.eventId, kind: data.kind } };
  e.waitUntil((async () => {
    await self.registration.showNotification(title, options);
    const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of clients) c.postMessage({ type: "push", data });
    if (data.kind === "help_test" || data.kind === "help") {
      await fetch("/api/biscuit/push/ack", { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify({ eventId: data.eventId, kind: data.kind }) }).catch(() => {});
    }
  })());
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || "/";
  e.waitUntil((async () => {
    const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of clients) {
      if ("focus" in c) { await c.focus(); c.postMessage({ type: "open", url }); return; }
    }
    await self.clients.openWindow(url);
  })());
});

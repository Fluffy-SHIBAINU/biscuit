import { api } from "./api.js";
import { navigate } from "./navigate.js";
import { store } from "./store.js";

export function urlBase64ToUint8Array(s) {
  const b = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(b, (ch) => ch.charCodeAt(0));
}

export function pushSupported() {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

/** Registers the worker, asks once, subscribes, and tells the server. Call from a tap: iOS needs the gesture. */
export async function subscribePush({ ana = false } = {}) {
  if (!pushSupported()) return false;
  const reg = await navigator.serviceWorker.register("/sw.js");
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return false;
  const { key } = await api("/push/key");
  const sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key) }));
  await api(ana ? "/push/subscribe/ana" : "/push/subscribe", { method: "POST", json: { subscription: sub.toJSON() } });
  if (!ana) store.set({ pushSubscribed: true });
  return true;
}

/** Messages from the worker: a push while the app is open, or a notification tap. */
export function listenToWorker() {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.register("/sw.js").catch(() => {});
  navigator.serviceWorker.addEventListener("message", (e) => {
    const m = e.data || {};
    if (m.type === "push" && m.data?.kind === "mail_seen") store.set({ lastMailSeen: new Date().toISOString() });
    if (m.type === "open" && m.url) navigate(m.url);
  });
}

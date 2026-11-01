// A short log of what the voice and the ear did, on this phone only, for the Diagnostics screen. Nothing leaves the phone.
import { useSyncExternalStore } from "react";

const MAX = 60;
let lines = [];
const listeners = new Set();
export function diag(what, detail) {
  const t = new Date();
  const stamp = `${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")}:${String(t.getSeconds()).padStart(2, "0")}`;
  lines = [...lines.slice(-(MAX - 1)), `${stamp} ${what}${detail !== undefined ? ` ${typeof detail === "string" ? detail : JSON.stringify(detail)}` : ""}`];
  listeners.forEach((l) => l());
}
export function diagLines() { return lines; }
export function useDiag() {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => lines, () => lines);
}
if (typeof window !== "undefined") {
  window.addEventListener("error", (e) => diag("error", String(e?.message || e).slice(0, 120)));
  window.addEventListener("unhandledrejection", (e) => diag("rejection", String(e?.reason?.message || e?.reason || e).slice(0, 120)));
}

import { useSyncExternalStore } from "react";

const KEY = "biscuit";
const EMPTY = { deviceToken: null, kind: null, household: null, docket: [], answers: {}, consentedAt: null, buttonsMode: false, lastMailSeen: null, volumeStep: 0, lastReading: null, lookRequest: null, pushSubscribed: false, cam: null, camRefusals: 0, helpOpenAt: null, anaPhone: null, helpTested: false };
const listeners = new Set();
let state = load();

function load() {
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? { ...EMPTY, ...JSON.parse(raw) } : { ...EMPTY };
  } catch {
    return { ...EMPTY };
  }
}

function persist() {
  try { window.localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* storage may be unavailable */ }
  listeners.forEach((l) => l());
}

export const store = {
  get: () => state,
  set(patch) { state = { ...state, ...(typeof patch === "function" ? patch(state) : patch) }; persist(); },
  clear() { state = { ...EMPTY }; try { window.localStorage.removeItem(KEY); } catch { /* ignore */ } listeners.forEach((l) => l()); },
};

export function useStore() {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => state, () => state);
}

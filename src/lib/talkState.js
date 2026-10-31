// What the ear bar shows: the phase, the last thing heard and Biscuit's last reply. On this phone only.
import { useSyncExternalStore } from "react";

let state = { phase: "idle", heard: "", reply: "", at: 0 };
const listeners = new Set();
export const talkState = {
  get: () => state,
  set(patch) { state = { ...state, ...patch, at: Date.now() }; listeners.forEach((l) => l()); },
};
export function useTalk() {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => state, () => state);
}

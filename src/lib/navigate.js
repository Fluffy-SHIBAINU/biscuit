import { useSyncExternalStore } from "react";
import { flushSync } from "react-dom";

const listeners = new Set();
const notify = () => listeners.forEach((l) => l());

/**
 * A screen change as one view transition where the browser has them: the sheet fades while the dog and the bar (named in
 * their own components) stay put. Elsewhere, and under reduced motion, the plain switch.
 */
export function transition(update) {
  if (typeof document === "undefined" || !document.startViewTransition || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return update();
  document.startViewTransition(() => flushSync(update));
}
if (typeof window !== "undefined") window.addEventListener("popstate", () => transition(notify));

export const getPath = () => window.location.pathname;
export const getSearch = () => window.location.search;

export function navigate(path) {
  if (window.location.pathname + window.location.search !== path) window.history.pushState({}, "", path);
  transition(notify);
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function usePath() {
  return useSyncExternalStore(subscribe, getPath, () => "/");
}

/** The query string, for a screen whose state lives there: a navigation that changes only the query re-renders it. */
export function useSearch() {
  return useSyncExternalStore(subscribe, getSearch, () => "");
}

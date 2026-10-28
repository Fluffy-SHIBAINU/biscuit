import { useSyncExternalStore } from "react";

const listeners = new Set();

export const getPath = () => window.location.pathname;
export const getSearch = () => window.location.search;

export function navigate(path) {
  if (window.location.pathname + window.location.search !== path) window.history.pushState({}, "", path);
  listeners.forEach((l) => l());
}

function subscribe(listener) {
  listeners.add(listener);
  window.addEventListener("popstate", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("popstate", listener);
  };
}

export function usePath() {
  return useSyncExternalStore(subscribe, getPath, () => "/");
}

/** The query string, for a screen whose state lives there: a navigation that changes only the query re-renders it. */
export function useSearch() {
  return useSyncExternalStore(subscribe, getSearch, () => "");
}

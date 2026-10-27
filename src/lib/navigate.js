import { useSyncExternalStore } from "react";

const listeners = new Set();

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
  return useSyncExternalStore(subscribe, () => window.location.pathname, () => "/");
}

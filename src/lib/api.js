import { store } from "./store.js";

export class ApiError extends Error {
  constructor(status, body) { super(body?.error || `HTTP ${status}`); this.status = status; this.body = body; }
}

export async function api(path, { method = "GET", json, form, token } = {}) {
  const headers = {};
  const auth = token ?? store.get().deviceToken;
  if (auth) headers.authorization = `Bearer ${auth}`;
  if (json !== undefined) headers["content-type"] = "application/json";
  const res = await fetch(`/api/biscuit${path}`, { method, headers, body: json !== undefined ? JSON.stringify(json) : form });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && body?.error === "unlinked") store.set({ deviceToken: null });
    throw new ApiError(res.status, body);
  }
  return body;
}

export async function transcribe(wavBlob) {
  const form = new FormData();
  form.set("audio", wavBlob, "clip.wav");
  return (await api("/asr", { method: "POST", form })).text;
}

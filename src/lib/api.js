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

export async function frameCheck(jpegBlob) {
  const form = new FormData();
  form.set("image", jpegBlob, "frame.jpg");
  return api("/letter/frame", { method: "POST", form });
}

export async function readLetter(jpegBlob) {
  const form = new FormData();
  form.set("image", jpegBlob, "letter.jpg");
  return api("/letter/read", { method: "POST", form });
}

export const postLetter = (entry) => api("/letter", { method: "POST", json: entry });
export const patchLetter = (id, patch) => api(`/letter/${id}`, { method: "PATCH", json: patch });
export const handoff = (letterId, ccn) => api("/handoff", { method: "POST", json: { letterId, ccn } });
export const postEvent = (kind, data = {}) => api("/events", { method: "POST", json: { kind, data } });
export const getDocket = () => api("/docket");

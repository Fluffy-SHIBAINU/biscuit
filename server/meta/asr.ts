import { logMeta, metaFetch } from "./client.js";

export const MODEL = "muse-voice-transcribe-1.0";
export type AsrTransport = (form: FormData) => Promise<any>;

export async function asrTranscribe(form: FormData): Promise<any> {
  const started = Date.now();
  const res = await metaFetch("/asr/transcribe", { method: "POST", body: form, timeoutMs: 60_000 });
  const json = await res.json().catch(() => ({}));
  logMeta({ model: MODEL, path: "/asr/transcribe", ms: Date.now() - started, status: res.status });
  if (!res.ok) throw new Error(`asr ${res.status}: ${JSON.stringify(json).slice(0, 200)}`);
  return json;
}

export function asrRequest(opts: { language: string; keywords: string[] }): Record<string, unknown> {
  return { mode: "PUSH_TO_TALK", model: MODEL, audioEncoding: "WAV", keywords: opts.keywords, languageBias: [opts.language] };
}

/** One clip in, its words out. The clip is a mono 16-bit WAV; nothing is kept after the call. */
export async function transcribeClip(audio: Buffer, mime: string, opts: { language: string; keywords: string[] }, transport: AsrTransport = asrTranscribe): Promise<string> {
  const form = new FormData();
  form.set("request", new Blob([JSON.stringify(asrRequest(opts))], { type: "application/json" }));
  form.set("audio", new Blob([new Uint8Array(audio)], { type: mime }), "clip.wav");
  const json = await transport(form);
  return String(json?.transcript ?? "").trim();
}

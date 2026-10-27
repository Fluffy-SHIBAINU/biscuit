import { Hono } from "hono";
import type { MiddlewareHandler } from "hono";
import type { AuthVars } from "../auth.js";
import { transcribeClip } from "../meta/asr.js";

export const MAX_AUDIO_BYTES = 2_000_000;
export const MAX_AUDIO_MS = 15_000;
export const BASE_KEYWORDS = ["Biscuit", "stop", "yes", "no", "help", "Medicare", "Social Security"];
export type AsrFn = (audio: Buffer, mime: string, opts: { language: string; keywords: string[] }) => Promise<string>;

/** Milliseconds of audio in a PCM WAV from its header; 0 when the header is not WAV. */
export function wavDurationMs(buf: Buffer): number {
  if (buf.length < 44) return 0;
  const channels = buf.readUInt16LE(22) || 1;
  const rate = buf.readUInt32LE(24) || 16000;
  const bits = buf.readUInt16LE(34) || 16;
  const dataBytes = buf.readUInt32LE(40);
  return Math.round((dataBytes / (rate * channels * (bits / 8))) * 1000);
}

export function rosaRoutes(deps: { auth: MiddlewareHandler<AuthVars>; asr?: AsrFn }) {
  const asr = deps.asr ?? transcribeClip;
  return new Hono<AuthVars>().post("/asr", deps.auth, async (c) => {
    const form = await c.req.formData();
    const audio = form.get("audio");
    if (!(audio instanceof Blob)) return c.json({ error: "no_audio" }, 400);
    if (audio.size > MAX_AUDIO_BYTES) return c.json({ error: "too_large" }, 413);
    const buf = Buffer.from(await audio.arrayBuffer());
    if (wavDurationMs(buf) > MAX_AUDIO_MS) return c.json({ error: "too_long" }, 413);
    const text = await asr(buf, audio.type || "audio/wav", { language: c.var.household.language, keywords: BASE_KEYWORDS });
    return c.json({ text });
  });
}

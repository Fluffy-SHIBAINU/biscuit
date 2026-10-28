import type { Extraction } from "./meta/spark.js";
import { verifyFacts, type Fact } from "./verify.js";

/** A reader transcribes a picture and extracts facts from its own text; `label` is the name the screens print (the model). */
export type Reader = { label?: string; transcribe: (jpeg: Buffer) => Promise<string>; extract: (t: string) => Promise<Extraction> };
export type Read = { transcription: string; extraction: Extraction; facts: Fact[]; senderName: string };
export type ReaderStatus = "ok" | "unreadable" | "failed" | "timeout";
export type ReadOutcome = { name: string; label?: string; status: ReaderStatus; ms: number; read: Read | null; error?: string };

export const MIN_WORDS = 40;
/** Each reader's share of the 12-second budget from capture to speech; the two run side by side. */
export const READ_TIMEOUT_MS = 10_000;

export function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    p.then((v) => { clearTimeout(timer); resolve(v); }, (e) => { clearTimeout(timer); reject(e); });
  });
}

/** One reader's full pass: transcribe, then extract from its own text, then verify each quote against that text. Null when the page is too short or names no sender. */
export async function readWith(reader: Reader, jpeg: Buffer): Promise<Read | null> {
  const transcription = await reader.transcribe(jpeg);
  const words = transcription.split(/\s+/).filter(Boolean).length;
  if (words < MIN_WORDS) return null;
  const extraction = await reader.extract(transcription);
  const senderName = extraction?.hospital_name?.value || extraction?.sender?.value || null;
  if (!extraction || !senderName) return null;
  return { transcription, extraction, facts: verifyFacts(extraction, transcription), senderName };
}

/** A reader's attempt with its outcome and milliseconds; never throws. */
export async function attempt(name: string, reader: Reader, jpeg: Buffer, timeoutMs: number): Promise<ReadOutcome> {
  const started = Date.now();
  const tag = reader.label ? { label: reader.label } : {};
  try {
    const read = await withTimeout(readWith(reader, jpeg), timeoutMs);
    return { name, ...tag, status: read ? "ok" : "unreadable", ms: Date.now() - started, read };
  } catch (err: any) {
    const timeout = err?.message === "timeout";
    return { name, ...tag, status: timeout ? "timeout" : "failed", ms: Date.now() - started, read: null, error: timeout ? undefined : String(err?.message ?? err).slice(0, 200) };
  }
}

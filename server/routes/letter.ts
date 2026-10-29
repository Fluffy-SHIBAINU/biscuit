import { waitUntil } from "@vercel/functions";
import { Hono } from "hono";
import type { MiddlewareHandler } from "hono";
import type { AuthVars } from "../auth.js";
import type { Events } from "../events.js";
import { frameCheck } from "../frame.js";
import { detect, LETTER_PROMPT, type Detection, type SamPrompt } from "../meta/sam.js";
import { extractFacts, transcribeLetter } from "../meta/spark.js";
import { fireworksReaderFor, readerModel } from "../fireworks/spark.js";
import { composeOffer, composeReading, sameName, unknownNumber } from "../compose.js";
import { matchHospital, statesFromText } from "../hospitals.js";
import { fetchSheet, type SheetSummary } from "../waive.js";
import { attempt, READ_TIMEOUT_MS, type Reader, type ReadOutcome } from "../read.js";
import { agree } from "../agree.js";

export { MIN_WORDS } from "../read.js";
export const MAX_FRAME_BYTES = 300_000;
export const MAX_LETTER_BYTES = 2_000_000;
export const READS_PER_HOUR = 20;

export type SparkDeps = Reader;
export type SamDeps = { detect: (jpeg: Buffer, prompt: SamPrompt) => Promise<Detection[]> };
export type SheetFn = (ccn: string) => Promise<SheetSummary | null>;

/** The second reader is on when READER_SECOND=fireworks and a key is set, on the model FIREWORKS_READER_MODEL names (DeepSeek V4.1 Flash by default). Tests pass one in, or null for off. */
export function secondReader(env: Record<string, string | undefined> = process.env): Reader | null {
  return env.READER_SECOND === "fireworks" && env.FIREWORKS_API_KEY ? fireworksReaderFor(readerModel(env)) : null;
}

export const SHADOW_LABEL = "Kindred's reader (Glimmer 30B, trained)";

/** The shadow reader: FIREWORKS_READER_SHADOW names a model that reads beside the pair for Ana's page and the eval log. It never speaks. */
export function shadowReader(env: Record<string, string | undefined> = process.env): Reader | null {
  const model = env.FIREWORKS_READER_SHADOW?.trim();
  if (!model || !env.FIREWORKS_API_KEY) return null;
  return { ...fireworksReaderFor(model), label: env.FIREWORKS_READER_SHADOW_LABEL?.trim() || SHADOW_LABEL };
}

async function imageOf(c: any, max: number): Promise<Buffer | { error: string; status: 400 | 413 }> {
  const form = await c.req.formData();
  const image = form.get("image");
  if (!(image instanceof Blob)) return { error: "no_image", status: 400 };
  if (image.size > max) return { error: "too_large", status: 413 };
  return Buffer.from(await image.arrayBuffer());
}

export function letterRoutes(deps: { auth: MiddlewareHandler<AuthVars>; spark?: SparkDeps; reader2?: Reader | null; shadow?: Reader | null; waitUntil?: (p: Promise<unknown>) => void; readTimeoutMs?: number; sam?: SamDeps; events: Events; sheet?: SheetFn; frameLimiter?: (key: string) => Promise<boolean> }) {
  const sheetOf: SheetFn = deps.sheet ?? fetchSheet;
  const spark: Reader = deps.spark ?? { transcribe: transcribeLetter, extract: extractFacts };
  const second: Reader | null = deps.reader2 === undefined ? secondReader() : deps.reader2;
  const shadow: Reader | null = deps.shadow === undefined ? shadowReader() : deps.shadow;
  // Work after the reply: on Vercel the function stays up for it; elsewhere the promise simply runs.
  const defer = deps.waitUntil ?? ((p: Promise<unknown>) => { waitUntil(p); });
  const timeoutMs = deps.readTimeoutMs ?? READ_TIMEOUT_MS;
  const sam: SamDeps = deps.sam ?? { detect };
  return new Hono<AuthVars>()
    .post("/letter/frame", deps.auth, async (c) => {
      if (deps.frameLimiter && !(await deps.frameLimiter(`frame:${c.var.device.id}`))) return c.json({ error: "rate" }, 429);
      const img = await imageOf(c, MAX_FRAME_BYTES);
      if (!Buffer.isBuffer(img)) return c.json({ error: img.error }, img.status);
      return c.json(frameCheck(await sam.detect(img, { text: LETTER_PROMPT })));
    })
    .post("/letter/read", deps.auth, async (c) => {
      const img = await imageOf(c, MAX_LETTER_BYTES);
      if (!Buffer.isBuffer(img)) return c.json({ error: img.error }, img.status);
      const home = c.var.household;
      if ((await deps.events.count(home.id, "letter_read", 3_600_000)) >= READS_PER_HOUR) return c.json({ error: "rate" }, 429);
      // Both readers at once: the read costs the slower of the two, never the sum. The shadow starts with them and is never waited for.
      const shadowRun: Promise<ReadOutcome> | null = shadow ? attempt("shadow", shadow, img, timeoutMs) : null;
      const [a, b] = await Promise.all([attempt("meta", spark, img, timeoutMs), second ? attempt("fireworks", second, img, timeoutMs) : Promise.resolve(null)]);
      const outcomes = b ? [a, b] : [a];
      const primary = a.read ? a : b?.read ? b : null;
      if (!primary) {
        const unreadable = outcomes.some((o) => o.status === "unreadable");
        return c.json({ error: unreadable ? "unreadable" : "readers_down" }, unreadable ? 422 : 503);
      }
      const other = primary === a ? b : a;
      const read = primary.read!;
      const gate = agree({ name: primary.name, facts: read.facts }, other?.read ? { name: other.name, facts: other.read.facts } : null, second ? "paired" : "single");
      const { extraction, transcription } = read;
      const hospitalName = extraction.hospital_name?.value || (extraction.kind === "bill" ? extraction.sender?.value : null);
      const match = hospitalName ? matchHospital(hospitalName, statesFromText(transcription)) : null;
      const hospital = match ? { ccn: match.ccn, name: match.name, city: match.city, state: match.state, score: match.score } : null;
      let sheet: SheetSummary | null = null;
      if (hospital) {
        try { sheet = await sheetOf(hospital.ccn); } catch { sheet = null; }
      }
      // A matched hospital's own bill is never "unknown number"; the rule is for letters from nobody on record.
      const unknown = hospital ? false : unknownNumber(gate.facts, sheet, extraction.kind);
      // Whose name is on it comes first; a letter addressed to someone else is named, not read, and Ana is told.
      const addressee = gate.facts.find((f) => f.field === "addressee" && f.spoken);
      const mismatch = Boolean(addressee && home.seniorName && !sameName(addressee.value, home.seniorName));
      const notABill = /\bnot a bill\b/i.test(transcription);
      const lines = composeReading(gate.facts.filter((f) => f.spoken), extraction.kind, { seniorName: home.seniorName, notABill });
      if (gate.differLine && !mismatch) lines.push(gate.differLine);
      const readers = outcomes.map(({ name, label, status, ms, error }) => ({ name, ...(label ? { label } : {}), status, ms, ...(error ? { error } : {}) }));
      const eventId = await deps.events.record(home.id, c.var.device.id, "letter_read", {
        kind: extraction.kind, readBy: gate.readBy, readers: readers.map(({ name, label, status, ms }) => ({ name, ...(label ? { label } : {}), status, ms })),
        agreed: gate.facts.filter((f) => f.agreement === "agreed").length, differ: gate.checks.length, mismatch,
      });
      if (shadowRun) {
        // The shadow's reading is compared with the spoken reader's and logged for Ana; nothing it read reaches Rosa.
        const of = read.facts.filter((f) => f.verified).length;
        defer(shadowRun.then((s) => {
          const g = s.read ? agree({ name: primary.name, facts: read.facts }, { name: "shadow", facts: s.read.facts }, "paired") : null;
          const agreed = g ? g.facts.filter((f) => f.agreement === "agreed").length : 0;
          return deps.events.record(home.id, c.var.device.id, "shadow_read", { letterEventId: eventId, name: "shadow", label: s.label ?? SHADOW_LABEL, status: s.status, ms: s.ms, ...(s.error ? { error: s.error } : {}), agreed, of });
        }).catch(() => undefined));
      }
      return c.json({
        transcription, facts: gate.facts, kind: extraction.kind, sender: read.senderName, hospital, sheet, unknownNumber: unknown, mismatch,
        readBy: gate.readBy, readers, checks: gate.checks, lines,
        offerLines: mismatch ? [] : unknown ? ["This asks you to call a number I don't know. Shall I tell Ana?"] : extraction.kind === "bill" ? composeOffer(sheet, {}) : [],
      });
    });
}

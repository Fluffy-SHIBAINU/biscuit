import { Hono } from "hono";
import type { MiddlewareHandler } from "hono";
import type { AuthVars } from "../auth.js";
import type { Events } from "../events.js";
import { frameCheck } from "../frame.js";
import { detect, LETTER_PROMPT, type Detection, type SamPrompt } from "../meta/sam.js";
import { extractFacts, transcribeLetter } from "../meta/spark.js";
import { fireworksReaderFor, readerModel } from "../fireworks/spark.js";
import { composeOffer, composeReading, unknownNumber } from "../compose.js";
import { matchHospital, statesFromText } from "../hospitals.js";
import { fetchSheet, type SheetSummary } from "../waive.js";
import { attempt, READ_TIMEOUT_MS, type Reader } from "../read.js";
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

async function imageOf(c: any, max: number): Promise<Buffer | { error: string; status: 400 | 413 }> {
  const form = await c.req.formData();
  const image = form.get("image");
  if (!(image instanceof Blob)) return { error: "no_image", status: 400 };
  if (image.size > max) return { error: "too_large", status: 413 };
  return Buffer.from(await image.arrayBuffer());
}

export function letterRoutes(deps: { auth: MiddlewareHandler<AuthVars>; spark?: SparkDeps; reader2?: Reader | null; readTimeoutMs?: number; sam?: SamDeps; events: Events; sheet?: SheetFn; frameLimiter?: (key: string) => Promise<boolean> }) {
  const sheetOf: SheetFn = deps.sheet ?? fetchSheet;
  const spark: Reader = deps.spark ?? { transcribe: transcribeLetter, extract: extractFacts };
  const second: Reader | null = deps.reader2 === undefined ? secondReader() : deps.reader2;
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
      // Both readers at once: the read costs the slower of the two, never the sum.
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
      const lines = composeReading(gate.facts.filter((f) => f.spoken), extraction.kind);
      if (gate.differLine) lines.push(gate.differLine);
      const readers = outcomes.map(({ name, label, status, ms, error }) => ({ name, ...(label ? { label } : {}), status, ms, ...(error ? { error } : {}) }));
      await deps.events.record(home.id, c.var.device.id, "letter_read", {
        kind: extraction.kind, readBy: gate.readBy, readers: readers.map(({ name, label, status, ms }) => ({ name, ...(label ? { label } : {}), status, ms })),
        agreed: gate.facts.filter((f) => f.agreement === "agreed").length, differ: gate.checks.length,
      });
      return c.json({
        transcription, facts: gate.facts, kind: extraction.kind, sender: read.senderName, hospital, sheet, unknownNumber: unknown,
        readBy: gate.readBy, readers, checks: gate.checks, lines,
        offerLines: unknown ? ["This asks you to call a number I don't know. I'm sending it to Ana."] : extraction.kind === "bill" ? composeOffer(sheet, {}) : [],
      });
    });
}

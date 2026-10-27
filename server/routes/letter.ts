import { Hono } from "hono";
import type { MiddlewareHandler } from "hono";
import type { AuthVars } from "../auth.js";
import type { Events } from "../events.js";
import { frameCheck } from "../frame.js";
import { detect, LETTER_PROMPT, type Detection, type SamPrompt } from "../meta/sam.js";
import { extractFacts, transcribeLetter, type Extraction } from "../meta/spark.js";
import { verifyFacts } from "../verify.js";

export const MAX_FRAME_BYTES = 300_000;
export const MAX_LETTER_BYTES = 2_000_000;
export const MIN_WORDS = 40;
export const READS_PER_HOUR = 20;

export type SparkDeps = { transcribe: (jpeg: Buffer) => Promise<string>; extract: (t: string) => Promise<Extraction> };
export type SamDeps = { detect: (jpeg: Buffer, prompt: SamPrompt) => Promise<Detection[]> };

async function imageOf(c: any, max: number): Promise<Buffer | { error: string; status: 400 | 413 }> {
  const form = await c.req.formData();
  const image = form.get("image");
  if (!(image instanceof Blob)) return { error: "no_image", status: 400 };
  if (image.size > max) return { error: "too_large", status: 413 };
  return Buffer.from(await image.arrayBuffer());
}

export function letterRoutes(deps: { auth: MiddlewareHandler<AuthVars>; spark?: SparkDeps; sam?: SamDeps; events: Events }) {
  const spark: SparkDeps = deps.spark ?? { transcribe: transcribeLetter, extract: extractFacts };
  const sam: SamDeps = deps.sam ?? { detect };
  return new Hono<AuthVars>()
    .post("/letter/frame", deps.auth, async (c) => {
      const img = await imageOf(c, MAX_FRAME_BYTES);
      if (!Buffer.isBuffer(img)) return c.json({ error: img.error }, img.status);
      return c.json(frameCheck(await sam.detect(img, { text: LETTER_PROMPT })));
    })
    .post("/letter/read", deps.auth, async (c) => {
      const img = await imageOf(c, MAX_LETTER_BYTES);
      if (!Buffer.isBuffer(img)) return c.json({ error: img.error }, img.status);
      const home = c.var.household;
      if ((await deps.events.count(home.id, "letter_read", 3_600_000)) >= READS_PER_HOUR) return c.json({ error: "rate" }, 429);
      const transcription = await spark.transcribe(img);
      const words = transcription.split(/\s+/).filter(Boolean).length;
      const extraction = words >= MIN_WORDS ? await spark.extract(transcription) : null;
      const senderName = extraction?.hospital_name?.value || extraction?.sender?.value || null;
      if (!extraction || !senderName) return c.json({ error: "unreadable" }, 422);
      const facts = verifyFacts(extraction, transcription);
      await deps.events.record(home.id, c.var.device.id, "letter_read", { kind: extraction.kind });
      return c.json({ transcription, facts, kind: extraction.kind, sender: senderName, hospital: null });
    });
}

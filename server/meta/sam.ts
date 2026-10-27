import { buildObjectPrompt, parseImageStream, recordsOfKind } from "@meta-sam/parser";
import { dataUrl, logMeta, openai } from "./client.js";
import { jpegSize } from "./jpeg.js";

export type Box = { x: number; y: number; w: number; h: number };
export type Detection = { box: Box; score: number; mask?: { encoding: string; width: number; height: number; payload: string } };
export type SamPrompt = { text: string } | { point: { x: number; y: number } };
export type EventSource = (body: Record<string, unknown>) => AsyncIterable<any> | Promise<AsyncIterable<any>>;

export const MODEL = "sam-3.1";
/** The noun phrase that finds a letter held in the frame. "letter" itself finds nothing; "document" scores 0.95. */
export const LETTER_PROMPT = "document";

export async function samStream(body: Record<string, unknown>): Promise<AsyncIterable<any>> {
  const started = Date.now();
  const stream = await openai().responses.create({ ...(body as any), stream: true });
  logMeta({ model: MODEL, path: "/responses", ms: Date.now() - started });
  return stream as unknown as AsyncIterable<any>;
}

export function samBody(text: string, jpeg: Buffer): Record<string, unknown> {
  return {
    model: MODEL,
    input: [{ type: "message", role: "user", content: [{ type: "input_text", text }, { type: "input_image", image_url: dataUrl(jpeg) }] }],
    metadata: { include_confidence: "true" },
  };
}

/** Boxes as fractions of the frame, best confidence first. A box without a confidence counts as 1. */
export async function parseSam(events: AsyncIterable<any>, width: number, height: number): Promise<Detection[]> {
  const result = await parseImageStream(events as any).finalResult;
  const boxes = recordsOfKind(result.records, "box");
  const masks = recordsOfKind(result.records, "mask");
  return boxes
    .map((b) => {
      const m = masks.find((x) => x.objectId === b.objectId);
      return {
        box: { x: b.left / width, y: b.top / height, w: (b.right - b.left) / width, h: (b.bottom - b.top) / height },
        score: typeof b.confidence === "number" ? b.confidence : 1,
        ...(m ? { mask: { encoding: m.mask.encoding, width: m.mask.width, height: m.mask.height, payload: m.mask.payload } } : {}),
      };
    })
    .sort((a, b) => b.score - a.score);
}

export async function detect(jpeg: Buffer, prompt: SamPrompt, source: EventSource = samStream): Promise<Detection[]> {
  const { width, height } = jpegSize(jpeg);
  const text =
    "text" in prompt
      ? prompt.text
      : buildObjectPrompt({
          size: { width, height },
          objects: [{ id: 1, prompts: [{ points: [{ x: Math.round(prompt.point.x * width), y: Math.round(prompt.point.y * height), label: "positive" }] }] }],
        });
  const events = await source(samBody(text, jpeg));
  return parseSam(events, width, height);
}

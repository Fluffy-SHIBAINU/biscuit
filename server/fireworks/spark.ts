// The second reader: one open model served per token by Fireworks, chosen by FIREWORKS_READER_MODEL, reading with the same
// prompts, schema and temperature as the Meta Model API reader, so a disagreement between the two is a reading difference,
// not a prompt one. Default: DeepSeek V4.1 Flash (measured 2026-10-27 on the synthetic bill: 3.6 to 5.3 s for both calls,
// no reasoning tokens, every quote verified). Muse Spark Open, Meta's open weights, is selectable but reasons on every call
// and refuses to stop: 14 s for the transcription alone, over the 10-second budget.
import { dataUrl } from "../meta/client.js";
import { EXTRACTION_SCHEMA, EXTRACT_PROMPT, TRANSCRIBE_PROMPT, messageContent, normalizeExtraction, type ChatTransport, type Extraction } from "../meta/spark.js";
import type { Reader } from "../read.js";
import { fireworksFetch, logFireworks } from "./client.js";

export const DEFAULT_MODEL = "accounts/fireworks/models/deepseek-v4p1-flash";
export const SPARK_OPEN_MODEL = "accounts/fireworks/models/muse-spark-open";
export const TRANSCRIBE_MAX_TOKENS = 4_000;
export const EXTRACT_MAX_TOKENS = 1_200;
const LABELS: Record<string, string> = { [DEFAULT_MODEL]: "DeepSeek V4.1 Flash on Fireworks", [SPARK_OPEN_MODEL]: "Spark Open on Fireworks" };

/** The model the second reader runs on: FIREWORKS_READER_MODEL when set, else the default. */
export function readerModel(env: Record<string, string | undefined> = process.env): string {
  return env.FIREWORKS_READER_MODEL?.trim() || DEFAULT_MODEL;
}

/** A letter is transcription and copying: no reasoning where the model allows it. Muse models (Spark Open, Glimmer and anything trained on Glimmer) refuse "none", so they get the least they offer. */
const MUSE = /muse-spark-open|glimmer/;
export function reasoningFor(model: string): "none" | "low" {
  return MUSE.test(model) ? "low" : "none";
}

/** The name the screens print for a reader on this model. */
export function readerLabel(model: string): string {
  return LABELS[model] ?? `${model.split("/").pop()} on Fireworks`;
}

export async function fwChat(body: Record<string, unknown>, fetcher: typeof fetch = fetch): Promise<any> {
  const started = Date.now();
  const res = await fireworksFetch("/chat/completions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), timeoutMs: 60_000 }, fetcher);
  const json = await res.json().catch(() => ({}));
  logFireworks({ model: String(body.model), path: "/chat/completions", ms: Date.now() - started, status: res.status, inputTokens: json?.usage?.prompt_tokens, outputTokens: json?.usage?.completion_tokens });
  if (!res.ok) throw new Error(`fireworks ${res.status}: ${JSON.stringify(json?.error ?? json).slice(0, 200)}`);
  return json;
}

export async function transcribeLetterFw(jpeg: Buffer, chat: ChatTransport = fwChat, model: string = readerModel()): Promise<string> {
  const json = await chat({
    model,
    temperature: 0,
    reasoning_effort: reasoningFor(model),
    max_tokens: TRANSCRIBE_MAX_TOKENS,
    messages: [{ role: "user", content: [{ type: "text", text: TRANSCRIBE_PROMPT }, { type: "image_url", image_url: { url: dataUrl(jpeg) } }] }],
  });
  return messageContent(json).trim();
}

export async function extractFactsFw(transcription: string, chat: ChatTransport = fwChat, model: string = readerModel()): Promise<Extraction> {
  const json = await chat({
    model,
    temperature: 0,
    reasoning_effort: reasoningFor(model),
    max_tokens: EXTRACT_MAX_TOKENS,
    messages: [{ role: "system", content: EXTRACT_PROMPT }, { role: "user", content: transcription }],
    response_format: { type: "json_schema", json_schema: { name: "letter_extraction", schema: EXTRACTION_SCHEMA } },
  });
  return normalizeExtraction(JSON.parse(messageContent(json) || "{}"));
}

/** A reader on one Fireworks model, labelled for the screens. */
export function fireworksReaderFor(model: string = readerModel()): Reader {
  return { label: readerLabel(model), transcribe: (jpeg) => transcribeLetterFw(jpeg, fwChat, model), extract: (t) => extractFactsFw(t, fwChat, model) };
}

/** The reader on the model the environment named when this module loaded; the route builds its own from the live env. */
export const fireworksReader: Reader = fireworksReaderFor();

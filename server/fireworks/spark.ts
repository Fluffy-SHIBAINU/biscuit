// The second reader: Muse Spark Open, Meta's open weights, served per token by Fireworks. Same prompts, schema and
// temperature as the Meta Model API reader, so a disagreement between the two is a reading difference, not a prompt one.
import { dataUrl } from "../meta/client.js";
import { EXTRACTION_SCHEMA, EXTRACT_PROMPT, TRANSCRIBE_PROMPT, messageContent, normalizeExtraction, type ChatTransport, type Extraction } from "../meta/spark.js";
import type { Reader } from "../read.js";
import { fireworksFetch, logFireworks } from "./client.js";

export const MODEL = "accounts/fireworks/models/muse-spark-open";
/** Spark Open reasons too; a letter is transcription and copying, so the least Fireworks offers. */
export const REASONING_EFFORT = "low";
export const TRANSCRIBE_MAX_TOKENS = 4_000;
export const EXTRACT_MAX_TOKENS = 1_200;

export async function fwChat(body: Record<string, unknown>, fetcher: typeof fetch = fetch): Promise<any> {
  const started = Date.now();
  const res = await fireworksFetch("/chat/completions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), timeoutMs: 60_000 }, fetcher);
  const json = await res.json().catch(() => ({}));
  logFireworks({ model: String(body.model), path: "/chat/completions", ms: Date.now() - started, status: res.status, inputTokens: json?.usage?.prompt_tokens, outputTokens: json?.usage?.completion_tokens });
  if (!res.ok) throw new Error(`fireworks ${res.status}: ${JSON.stringify(json?.error ?? json).slice(0, 200)}`);
  return json;
}

export async function transcribeLetterFw(jpeg: Buffer, chat: ChatTransport = fwChat): Promise<string> {
  const json = await chat({
    model: MODEL,
    temperature: 0,
    reasoning_effort: REASONING_EFFORT,
    max_tokens: TRANSCRIBE_MAX_TOKENS,
    messages: [{ role: "user", content: [{ type: "text", text: TRANSCRIBE_PROMPT }, { type: "image_url", image_url: { url: dataUrl(jpeg) } }] }],
  });
  return messageContent(json).trim();
}

export async function extractFactsFw(transcription: string, chat: ChatTransport = fwChat): Promise<Extraction> {
  const json = await chat({
    model: MODEL,
    temperature: 0,
    reasoning_effort: REASONING_EFFORT,
    max_tokens: EXTRACT_MAX_TOKENS,
    messages: [{ role: "system", content: EXTRACT_PROMPT }, { role: "user", content: transcription }],
    response_format: { type: "json_schema", json_schema: { name: "letter_extraction", schema: EXTRACTION_SCHEMA } },
  });
  return normalizeExtraction(JSON.parse(messageContent(json) || "{}"));
}

export const fireworksReader: Reader = { transcribe: (jpeg) => transcribeLetterFw(jpeg), extract: (t) => extractFactsFw(t) };

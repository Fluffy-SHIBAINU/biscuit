import { dataUrl, logMeta, metaFetch } from "./client.js";
import { QUESTIONS, type LetterKind } from "../questions.js";

export type { LetterKind };
export type Cited = { value: string; quote: string } | null;
export type Extraction = {
  kind: LetterKind;
  sender: Cited;
  hospital_name: Cited;
  amount_due: Cited;
  statement_date: Cited;
  due_date: Cited;
  financial_assistance: { value: boolean; quote: string } | null;
  phone_numbers: { value: string; quote: string }[];
  account_last4: Cited;
};

export type ChatTransport = (body: Record<string, unknown>) => Promise<any>;

export const MODEL = "muse-spark-1.3";
/** Spark reasons by default (a thousand-plus reasoning tokens, eight seconds a call); reading a letter is transcription and copying, so every call asks for the least. */
export const REASONING_EFFORT = "minimal";
export const TRANSCRIBE_PROMPT =
  "Transcribe every printed word on this page in reading order. Keep line breaks. Write numbers, dates and amounts exactly as printed. Add nothing.";
export const EXTRACT_PROMPT =
  "From this transcription, fill the schema. Every quote must be copied exactly from the transcription. Use null when the page does not say.";
export const QUESTIONS_PROMPT = "Choose at most two question ids for this letter kind and these known answers.";

const cited = { type: ["object", "null"], properties: { value: { type: "string" }, quote: { type: "string" } }, required: ["value", "quote"], additionalProperties: false };

export const EXTRACTION_SCHEMA = {
  type: "object",
  properties: {
    kind: { type: "string", enum: ["bill", "notice", "utility", "ad", "other"] },
    sender: cited,
    hospital_name: cited,
    amount_due: cited,
    statement_date: cited,
    due_date: cited,
    financial_assistance: { type: ["object", "null"], properties: { value: { type: "boolean" }, quote: { type: "string" } }, required: ["value", "quote"], additionalProperties: false },
    phone_numbers: { type: "array", items: { type: "object", properties: { value: { type: "string" }, quote: { type: "string" } }, required: ["value", "quote"], additionalProperties: false } },
    account_last4: cited,
  },
  required: ["kind", "sender", "hospital_name", "amount_due", "statement_date", "due_date", "financial_assistance", "phone_numbers", "account_last4"],
  additionalProperties: false,
};

export async function sparkChat(body: Record<string, unknown>): Promise<any> {
  const started = Date.now();
  const res = await metaFetch("/chat/completions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), timeoutMs: 60_000 });
  const json = await res.json().catch(() => ({}));
  logMeta({ model: String(body.model), path: "/chat/completions", ms: Date.now() - started, status: res.status, inputTokens: json?.usage?.prompt_tokens, outputTokens: json?.usage?.completion_tokens });
  if (!res.ok) throw new Error(`spark ${res.status}: ${JSON.stringify(json?.error ?? json).slice(0, 200)}`);
  return json;
}

/** The assistant text of a chat completion, whether a string or text parts. */
export function messageContent(json: any): string {
  const c = json?.choices?.[0]?.message?.content;
  return typeof c === "string" ? c : Array.isArray(c) ? c.map((p: any) => p?.text ?? "").join("") : "";
}
const content = messageContent;

export async function transcribeLetter(jpeg: Buffer, chat: ChatTransport = sparkChat): Promise<string> {
  const json = await chat({
    model: MODEL,
    temperature: 0,
    reasoning_effort: REASONING_EFFORT,
    messages: [{ role: "user", content: [{ type: "text", text: TRANSCRIBE_PROMPT }, { type: "image_url", image_url: { url: dataUrl(jpeg) } }] }],
  });
  return content(json).trim();
}

const KINDS: LetterKind[] = ["bill", "notice", "utility", "ad", "other"];

function citedOf(v: any): Cited {
  if (!v || typeof v !== "object" || typeof v.value !== "string" || typeof v.quote !== "string" || !v.value) return null;
  return { value: v.value, quote: v.quote };
}

export function normalizeExtraction(raw: any): Extraction {
  const fa = raw?.financial_assistance;
  return {
    kind: KINDS.includes(raw?.kind) ? raw.kind : "other",
    sender: citedOf(raw?.sender),
    hospital_name: citedOf(raw?.hospital_name),
    amount_due: citedOf(raw?.amount_due),
    statement_date: citedOf(raw?.statement_date),
    due_date: citedOf(raw?.due_date),
    financial_assistance: fa && typeof fa === "object" && typeof fa.quote === "string" ? { value: Boolean(fa.value), quote: fa.quote } : null,
    phone_numbers: Array.isArray(raw?.phone_numbers) ? raw.phone_numbers.map(citedOf).filter((x: Cited): x is NonNullable<Cited> => x !== null) : [],
    account_last4: citedOf(raw?.account_last4),
  };
}

export async function extractFacts(transcription: string, chat: ChatTransport = sparkChat): Promise<Extraction> {
  const json = await chat({
    model: MODEL,
    temperature: 0,
    reasoning_effort: REASONING_EFFORT,
    messages: [{ role: "system", content: EXTRACT_PROMPT }, { role: "user", content: transcription }],
    response_format: { type: "json_schema", json_schema: { name: "letter_extraction", schema: EXTRACTION_SCHEMA } },
  });
  return normalizeExtraction(JSON.parse(content(json) || "{}"));
}

export async function chooseQuestions(kind: LetterKind, known: string[], chat: ChatTransport = sparkChat): Promise<string[]> {
  const catalogue = Object.entries(QUESTIONS).map(([id, q]) => `${id}: "${q.text}" (for: ${q.kinds.join(", ")}${q.needsSheet ? "; only when the hospital's policy sheet is known" : ""})`).join("\n");
  const json = await chat({
    model: MODEL,
    temperature: 0,
    reasoning_effort: REASONING_EFFORT,
    messages: [
      { role: "system", content: QUESTIONS_PROMPT },
      { role: "user", content: `Letter kind: ${kind}\nAlready answered: ${known.join(", ") || "none"}\nQuestions:\n${catalogue}` },
    ],
    response_format: { type: "json_schema", json_schema: { name: "question_choice", schema: { type: "object", properties: { questions: { type: "array", items: { type: "string", enum: Object.keys(QUESTIONS) }, maxItems: 2 } }, required: ["questions"], additionalProperties: false } } },
  });
  const parsed = JSON.parse(content(json) || "{}");
  return Array.isArray(parsed.questions) ? parsed.questions.filter((q: unknown) => typeof q === "string").slice(0, 2) : [];
}

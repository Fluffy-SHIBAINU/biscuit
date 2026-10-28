import { expect, test } from "vitest";
import { EXTRACTION_SCHEMA } from "../server/meta/spark.js";
import { DEFAULT_MODEL, SPARK_OPEN_MODEL, extractFactsFw, fireworksReader, fireworksReaderFor, fwChat, readerLabel, readerModel, reasoningFor, transcribeLetterFw } from "../server/fireworks/spark.js";
import transcribed from "./fixtures/meta/spark-transcribe.json" with { type: "json" };
import extracted from "./fixtures/meta/spark-extract.json" with { type: "json" };

function capture(reply: unknown) {
  const bodies: Record<string, any>[] = [];
  return { bodies, chat: async (body: Record<string, unknown>) => { bodies.push(body); return reply; } };
}

test("the second reader is DeepSeek V4.1 Flash unless FIREWORKS_READER_MODEL names another model", () => {
  expect(DEFAULT_MODEL).toBe("accounts/fireworks/models/deepseek-v4p1-flash");
  expect(readerModel({})).toBe(DEFAULT_MODEL);
  expect(readerModel({ FIREWORKS_READER_MODEL: SPARK_OPEN_MODEL })).toBe(SPARK_OPEN_MODEL);
  expect(readerModel({ FIREWORKS_READER_MODEL: "  " })).toBe(DEFAULT_MODEL);
});

test("reasoning is off for a reader that allows it and low for Muse Spark Open, which refuses none", () => {
  expect(reasoningFor(DEFAULT_MODEL)).toBe("none");
  expect(reasoningFor(SPARK_OPEN_MODEL)).toBe("low");
});

test("each model has a label the screens can print", () => {
  expect(readerLabel(DEFAULT_MODEL)).toBe("DeepSeek V4.1 Flash on Fireworks");
  expect(readerLabel(SPARK_OPEN_MODEL)).toBe("Spark Open on Fireworks");
  expect(readerLabel("accounts/fireworks/models/kimi-k3")).toBe("kimi-k3 on Fireworks");
  expect(fireworksReaderFor(SPARK_OPEN_MODEL).label).toBe("Spark Open on Fireworks");
  expect(fireworksReader.label).toBe(readerLabel(readerModel()));
});

test("transcription goes to the chosen model with its reasoning setting and the picture", async () => {
  const { bodies, chat } = capture(transcribed);
  const text = await transcribeLetterFw(Buffer.from("ffd8ffd9", "hex"), chat);
  expect(text).toContain("Amount Due: $1,850.00");
  expect(bodies[0]).toMatchObject({ model: DEFAULT_MODEL, reasoning_effort: "none", temperature: 0 });
  expect(bodies[0].max_tokens).toBeGreaterThan(1000);
  expect(bodies[0].messages[0].content[1].image_url.url).toMatch(/^data:image\/jpeg;base64,/);
  await transcribeLetterFw(Buffer.from("ffd8ffd9", "hex"), chat, SPARK_OPEN_MODEL);
  expect(bodies[1]).toMatchObject({ model: SPARK_OPEN_MODEL, reasoning_effort: "low" });
});

test("extraction uses the shared schema and prompt on the chosen model", async () => {
  const { bodies, chat } = capture(extracted);
  const x = await extractFactsFw("Amount Due: $1,850.00", chat);
  expect(x.amount_due?.value).toBe("$1,850.00");
  expect(bodies[0]).toMatchObject({ model: DEFAULT_MODEL, reasoning_effort: "none" });
  expect(bodies[0].response_format).toEqual({ type: "json_schema", json_schema: { name: "letter_extraction", schema: EXTRACTION_SCHEMA } });
  expect(bodies[0].messages[0].role).toBe("system");
  await extractFactsFw("Amount Due: $1,850.00", chat, SPARK_OPEN_MODEL);
  expect(bodies[1]).toMatchObject({ model: SPARK_OPEN_MODEL, reasoning_effort: "low" });
});

test("fwChat posts to Fireworks with the key and throws on a bad status", async () => {
  process.env.FIREWORKS_API_KEY = "test-key";
  const calls: { url: string; init: any }[] = [];
  const ok: typeof fetch = async (url, init) => { calls.push({ url: String(url), init }); return new Response(JSON.stringify(transcribed), { status: 200, headers: { "content-type": "application/json" } }); };
  const json = await fwChat({ model: DEFAULT_MODEL, messages: [] }, ok);
  expect(json.choices[0].message.content).toContain("Amount Due");
  expect(calls[0].url).toBe("https://api.fireworks.ai/inference/v1/chat/completions");
  expect(calls[0].init.headers.authorization).toBe("Bearer test-key");
  const bad: typeof fetch = async () => new Response(JSON.stringify({ error: { message: "nope" } }), { status: 400 });
  await expect(fwChat({ model: DEFAULT_MODEL, messages: [] }, bad)).rejects.toThrow(/fireworks 400/);
  expect(typeof fireworksReader.transcribe).toBe("function");
});

import { expect, test } from "vitest";
import { EXTRACTION_SCHEMA } from "../server/meta/spark.js";
import { extractFactsFw, fireworksReader, fwChat, MODEL, transcribeLetterFw } from "../server/fireworks/spark.js";
import transcribed from "./fixtures/meta/spark-transcribe.json" with { type: "json" };
import extracted from "./fixtures/meta/spark-extract.json" with { type: "json" };

function capture(reply: unknown) {
  const bodies: Record<string, any>[] = [];
  return { bodies, chat: async (body: Record<string, unknown>) => { bodies.push(body); return reply; } };
}

test("transcription goes to Muse Spark Open on Fireworks with low reasoning and the picture", async () => {
  const { bodies, chat } = capture(transcribed);
  const text = await transcribeLetterFw(Buffer.from("ffd8ffd9", "hex"), chat);
  expect(text).toContain("Amount Due: $1,850.00");
  expect(bodies[0]).toMatchObject({ model: MODEL, reasoning_effort: "low", temperature: 0 });
  expect(bodies[0].max_tokens).toBeGreaterThan(1000);
  expect(bodies[0].messages[0].content[1].image_url.url).toMatch(/^data:image\/jpeg;base64,/);
});

test("extraction uses the shared schema and prompt", async () => {
  const { bodies, chat } = capture(extracted);
  const x = await extractFactsFw("Amount Due: $1,850.00", chat);
  expect(x.amount_due?.value).toBe("$1,850.00");
  expect(bodies[0].response_format).toEqual({ type: "json_schema", json_schema: { name: "letter_extraction", schema: EXTRACTION_SCHEMA } });
  expect(bodies[0].messages[0].role).toBe("system");
});

test("fwChat posts to Fireworks with the key and throws on a bad status", async () => {
  process.env.FIREWORKS_API_KEY = "test-key";
  const calls: { url: string; init: any }[] = [];
  const ok: typeof fetch = async (url, init) => { calls.push({ url: String(url), init }); return new Response(JSON.stringify(transcribed), { status: 200, headers: { "content-type": "application/json" } }); };
  const json = await fwChat({ model: MODEL, messages: [] }, ok);
  expect(json.choices[0].message.content).toContain("Amount Due");
  expect(calls[0].url).toBe("https://api.fireworks.ai/inference/v1/chat/completions");
  expect(calls[0].init.headers.authorization).toBe("Bearer test-key");
  const bad: typeof fetch = async () => new Response(JSON.stringify({ error: { message: "nope" } }), { status: 400 });
  await expect(fwChat({ model: MODEL, messages: [] }, bad)).rejects.toThrow(/fireworks 400/);
  expect(typeof fireworksReader.transcribe).toBe("function");
});

import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { transcribeLetter, extractFacts, chooseQuestions } from "../server/meta/spark.js";
import { detect, parseSam, LETTER_PROMPT } from "../server/meta/sam.js";
import { transcribeClip } from "../server/meta/asr.js";

const fx = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/meta/${name}.json`, import.meta.url), "utf8"));
const jpeg = readFileSync(new URL("./fixtures/letter-synthetic.jpg", import.meta.url));
const wav = readFileSync(new URL("./fixtures/hello.wav", import.meta.url));
const chat = (name: string) => async () => fx(name);
const events = (name: string) => () => (async function* () { for (const e of fx(name)) yield e; })();

test("transcribeLetter returns the printed text", async () => {
  expect(await transcribeLetter(jpeg, chat("spark-transcribe"))).toContain("Amount Due: $1,850.00");
});

test("extractFacts carries quotes", async () => {
  const x = await extractFacts("ignored, the fixture answers", chat("spark-extract"));
  const transcription: string = fx("spark-transcribe").choices[0].message.content;
  expect(x.amount_due?.value).toBe("$1,850.00");
  expect(transcription).toContain(x.amount_due!.quote);
  expect(x.kind).toBe("bill");
});

test("chooseQuestions returns ids", async () => {
  expect(await chooseQuestions("bill", [], chat("spark-questions"))).toEqual(expect.arrayContaining(["Q1"]));
});

test("parseSam returns fractional boxes with confidence", async () => {
  const d = await parseSam(events("sam-mailbox")(), 1280, 960);
  expect(d.length).toBeGreaterThan(0);
  expect(d[0].score).toBeGreaterThanOrEqual(0.5);
  expect(d[0].box.x).toBeGreaterThanOrEqual(0);
  expect(d[0].box.x + d[0].box.w).toBeLessThanOrEqual(1);
});

test("detect finds a letter in the bill picture", async () => {
  const d = await detect(jpeg, { text: LETTER_PROMPT }, events("sam-letter"));
  expect(d[0].box.w * d[0].box.h).toBeGreaterThan(0.3);
});

test("transcribeClip returns words", async () => {
  const text = await transcribeClip(wav, "audio/wav", { language: "en", keywords: ["Biscuit"] }, chat("asr"));
  expect(text.toLowerCase()).toContain("hello biscuit");
});

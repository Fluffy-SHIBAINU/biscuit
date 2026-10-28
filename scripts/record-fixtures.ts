// Records real Meta Model API responses for the synthetic fixtures. Run once: npx tsx scripts/record-fixtures.ts
import { config } from "dotenv";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { sparkChat, transcribeLetter, extractFacts, chooseQuestions } from "../server/meta/spark.js";
import { samStream, detect, LETTER_PROMPT } from "../server/meta/sam.js";
import { asrTranscribe, transcribeClip } from "../server/meta/asr.js";
import { extractFactsFw, fwChat, transcribeLetterFw } from "../server/fireworks/spark.js";

config({ path: ".env.local", override: true });
const out = (name: string, data: unknown) => writeFileSync(`tests/fixtures/meta/${name}.json`, JSON.stringify(data, null, 1));
const chatRec = (name: string) => async (body: Record<string, unknown>) => { const j = await sparkChat(body); out(name, j); return j; };
const outFw = (name: string, data: unknown) => { mkdirSync("tests/fixtures/fireworks", { recursive: true }); writeFileSync(`tests/fixtures/fireworks/${name}.json`, JSON.stringify(data, null, 1)); };
const fwRec = (name: string) => async (body: Record<string, unknown>) => { const j = await fwChat(body); outFw(name, j); return j; };
const samRec = (name: string) => async (body: Record<string, unknown>) => {
  const stream = await samStream(body); const events: unknown[] = [];
  return (async function* () { try { for await (const e of stream) { events.push(e); yield e; } } finally { out(name, events); } })();
};
const asrRec = (name: string) => async (form: FormData) => { const j = await asrTranscribe(form); out(name, j); return j; };

const letter = readFileSync("tests/fixtures/letter-synthetic.jpg");
const mailbox = readFileSync("tests/fixtures/mailbox.jpg");
const wav = readFileSync("tests/fixtures/hello.wav");
const only = new Set(process.argv.slice(2));
const want = (n: string) => only.size === 0 || only.has(n);

if (want("spark")) {
  const text = await transcribeLetter(letter, chatRec("spark-transcribe"));
  console.log("transcription words:", text.split(/\s+/).length, "| has amount:", text.includes("Amount Due: $1,850.00"));
  const x = await extractFacts(text, chatRec("spark-extract"));
  console.log("extract:", JSON.stringify({ kind: x.kind, sender: x.sender, hospital_name: x.hospital_name, amount_due: x.amount_due, due_date: x.due_date }));
  console.log("questions:", await chooseQuestions("bill", [], chatRec("spark-questions")));
}
if (want("sam")) {
  const mb = await detect(mailbox, { text: "mailbox" }, samRec("sam-mailbox"));
  console.log("sam mailbox:", mb.length, "boxes", JSON.stringify(mb.slice(0, 2).map((d) => ({ box: d.box, score: d.score, mask: !!d.mask }))));
  const lt = await detect(letter, { text: LETTER_PROMPT }, samRec("sam-letter"));
  console.log("sam letter:", lt.length, "boxes", JSON.stringify(lt.slice(0, 1).map((d) => ({ box: d.box, score: d.score }))));
}
if (want("fireworks")) {
  const text = await transcribeLetterFw(letter, fwRec("transcribe"));
  console.log("fireworks transcription words:", text.split(/\s+/).length, "| has amount:", text.includes("Amount Due: $1,850.00"));
  const x = await extractFactsFw(text, fwRec("extract"));
  console.log("fireworks extract:", JSON.stringify({ kind: x.kind, sender: x.sender, hospital_name: x.hospital_name, amount_due: x.amount_due, statement_date: x.statement_date, due_date: x.due_date }));
}
if (want("asr")) console.log("asr:", await transcribeClip(wav, "audio/wav", { language: "en", keywords: ["Biscuit"] }, asrRec("asr")));

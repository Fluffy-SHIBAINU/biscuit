// Runs Biscuit's production readers over the held-out synthetic letters and writes their raw outputs for the scorer.
//   npx tsx scripts/eval/readers.ts --in synth/holdout --out synth/runs/eval --readers meta,deepseek [--model <fireworks model>] [--jobs 3] [--limit 100]
// Each reader gets the same JPEG and the same two prompts as production: transcribe the picture, then extract from its
// own transcription. Nothing is verified here; scripts/eval/score.ts does that against the truth files.
import { config } from "dotenv";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { extractFacts, transcribeLetter } from "../../server/meta/spark.js";
import { DEFAULT_MODEL, extractFactsFw, readerLabel, transcribeLetterFw } from "../../server/fireworks/spark.js";
import type { Reader } from "../../server/read.js";

config({ path: ".env.local", override: true });

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

export type Prediction = { id: string; transcription: string | null; extraction: unknown | null; msTranscribe: number; msExtract: number; error?: string };

export function readerNamed(name: string, model: string): { label: string; reader: Reader } {
  if (name === "meta") return { label: "Spark 1.3 (Meta Model API)", reader: { transcribe: transcribeLetter, extract: extractFacts } };
  if (name === "deepseek") return { label: readerLabel(DEFAULT_MODEL), reader: { transcribe: (j) => transcribeLetterFw(j, undefined, DEFAULT_MODEL), extract: (t) => extractFactsFw(t, undefined, DEFAULT_MODEL) } };
  if (name === "fireworks") return { label: readerLabel(model), reader: { transcribe: (j) => transcribeLetterFw(j, undefined, model), extract: (t) => extractFactsFw(t, undefined, model) } };
  throw new Error(`unknown reader ${name}; one of meta, deepseek, fireworks`);
}

export async function predict(reader: Reader, id: string, jpeg: Buffer): Promise<Prediction> {
  const t0 = Date.now();
  let transcription: string | null = null, extraction: unknown | null = null, msTranscribe = 0, msExtract = 0;
  try {
    transcription = await reader.transcribe(jpeg);
    msTranscribe = Date.now() - t0;
    const t1 = Date.now();
    extraction = await reader.extract(transcription);
    msExtract = Date.now() - t1;
    return { id, transcription, extraction, msTranscribe, msExtract };
  } catch (err: any) {
    return { id, transcription, extraction, msTranscribe: msTranscribe || Date.now() - t0, msExtract, error: String(err?.message ?? err).slice(0, 200) };
  }
}

async function runReader(name: string, model: string, dir: string, out: string, jobs: number, limit: number) {
  const { label, reader } = readerNamed(name, model);
  const ids = readdirSync(join(dir, "truth")).filter((n) => n.endsWith(".json")).map((n) => n.replace(/\.json$/, "")).sort().slice(0, limit);
  const preds: Prediction[] = [];
  let next = 0;
  const started = Date.now();
  await Promise.all(Array.from({ length: jobs }, async () => {
    while (next < ids.length) {
      const id = ids[next++];
      preds.push(await predict(reader, id, readFileSync(join(dir, "jpg", `${id}.jpg`))));
      if (preds.length % 10 === 0) console.log(`${name}: ${preds.length}/${ids.length} in ${((Date.now() - started) / 1000).toFixed(0)} s`);
    }
  }));
  preds.sort((a, b) => a.id.localeCompare(b.id));
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, `predictions_${name}.jsonl`), preds.map((p) => JSON.stringify(p)).join("\n") + "\n");
  writeFileSync(join(out, `reader_${name}.json`), JSON.stringify({ name, label, model: name === "meta" ? "muse-spark-1.3" : name === "deepseek" ? DEFAULT_MODEL : model, letters: preds.length, errors: preds.filter((p) => p.error).length, seconds: (Date.now() - started) / 1000 }, null, 1));
  console.log(`${name}: ${preds.length} letters, ${preds.filter((p) => p.error).length} errors, ${((Date.now() - started) / 1000).toFixed(0)} s`);
}

if (process.argv[1] && /readers\.ts$/.test(process.argv[1])) {
  const names = arg("readers", "meta,deepseek").split(",").filter(Boolean);
  const model = arg("model", DEFAULT_MODEL);
  Promise.all(names.map((n) => runReader(n, model, arg("in", "synth/holdout"), arg("out", "synth/runs/eval"), Number(arg("jobs", "3")), Number(arg("limit", "100"))))).catch((e) => { console.error(e); process.exit(1); });
}

// Builds chat JSONL from rendered synthetic letters: two rows a letter under the production prompts and schema.
//   npx tsx scripts/synth/dataset.ts --in synth/train --out synth/train.jsonl [--images file|inline]
// Row A: the transcription prompt with the picture, answered by the printed lines in reading order.
// Row B: the extraction prompt with that transcription, answered by the truth JSON in the production Extraction shape.
// --images file (default) references the JPEG by file URL for local training; inline embeds it as a data URI for upload.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { EXTRACT_PROMPT, TRANSCRIBE_PROMPT } from "../../server/meta/spark.js";

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

export type Row = { id: string; task: "transcribe" | "extract"; messages: unknown[] };

export function rowsFor(id: string, transcription: string, truth: unknown, imageUrl: string): Row[] {
  return [
    { id, task: "transcribe", messages: [{ role: "user", content: [{ type: "text", text: TRANSCRIBE_PROMPT }, { type: "image_url", image_url: { url: imageUrl } }] }, { role: "assistant", content: transcription }] },
    { id, task: "extract", messages: [{ role: "system", content: EXTRACT_PROMPT }, { role: "user", content: transcription }, { role: "assistant", content: JSON.stringify(truth) }] },
  ];
}

export function buildDataset(dir: string, images: "file" | "inline"): Row[] {
  const truthDir = join(dir, "truth");
  const rows: Row[] = [];
  for (const name of readdirSync(truthDir).filter((n) => n.endsWith(".json")).sort()) {
    const t = JSON.parse(readFileSync(join(truthDir, name), "utf8"));
    const jpg = resolve(join(dir, "jpg", `${t.id}.jpg`));
    const url = images === "inline" ? `data:image/jpeg;base64,${readFileSync(jpg).toString("base64")}` : `file://${jpg}`;
    rows.push(...rowsFor(t.id, t.transcription, t.truth, url));
  }
  return rows;
}

if (process.argv[1] && /dataset\.ts$/.test(process.argv[1])) {
  const rows = buildDataset(arg("in", "synth/train"), arg("images", "file") === "inline" ? "inline" : "file");
  const out = arg("out", "synth/train.jsonl");
  writeFileSync(out, rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
  console.log(`${rows.length} rows (${rows.length / 2} letters) in ${out}`);
}

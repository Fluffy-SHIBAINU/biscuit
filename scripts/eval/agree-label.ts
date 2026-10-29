// Agreement labels for real pages: the two production readers read each page; a page becomes a training row only when
// both read the same kind and agree on every fact either one cited (the production gate used as a labeller). The
// transcription target is Spark 1.3's reading. These rows are tagged "real, agreement-labelled": not truth, but what
// Biscuit would have spoken.
//   npx tsx scripts/eval/agree-label.ts --in synth/realpool --preds synth/runs/realpool --out synth/realpool.jsonl
// --in has jpg/<id>.jpg; --preds has predictions_meta.jsonl and predictions_deepseek.jsonl from scripts/eval/readers.ts.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { valuesAgree } from "../../server/agree.js";
import { normalizeExtraction, type Extraction } from "../../server/meta/spark.js";
import { MIN_WORDS } from "../../server/read.js";
import { verifyFacts } from "../../server/verify.js";
import { rowsFor } from "../synth/dataset.js";

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
type Pred = { id: string; transcription: string | null; extraction: unknown | null; error?: string };
const load = (p: string) => new Map<string, Pred>(readFileSync(p, "utf8").split("\n").filter(Boolean).map((l) => { const x = JSON.parse(l) as Pred; return [x.id, x]; }));

const FIELDS = ["sender", "hospital_name", "amount_due", "statement_date", "due_date", "account_last4", "financial_assistance"] as const;

/**
 * The extraction the two readers would have spoken, with one allowance: a field only one reader cited is kept when its
 * quote verifies in that reader's own transcription (what the gate shows as "read once"). Both cited and disagree: no
 * row. Kinds must match. Phones are compared as sets of full numbers (ten digits or more; "1-800" fragments are noise),
 * and the union of verified full numbers is kept.
 */
export function agreed(a: Extraction, b: Extraction, ta: string, tb: string): Extraction | null {
  if (a.kind !== b.kind) return null;
  const present = (c: any) => c && typeof c.value !== "undefined" && String(c.value).trim() !== "" && String(c.value).toLowerCase() !== "null";
  const va = new Set(verifyFacts(a, ta).filter((f) => f.verified).map((f) => f.field + ":" + f.value));
  const vb = new Set(verifyFacts(b, tb).filter((f) => f.verified).map((f) => f.field + ":" + f.value));
  const out: Extraction = { ...a, phone_numbers: [] };
  for (const field of FIELDS) {
    const x = present(a[field]) ? a[field] : null, y = present(b[field]) ? b[field] : null;
    if (!x && !y) { (out as any)[field] = null; continue; }
    if (x && y) {
      const same = field === "financial_assistance" ? String((x as any).value) === String((y as any).value) : valuesAgree(field, String((x as any).value), String((y as any).value));
      if (!same) return null;
      (out as any)[field] = va.has(field + ":" + (x as any).value) ? x : vb.has(field + ":" + (y as any).value) ? y : null;
      if (!(out as any)[field]) return null;
      continue;
    }
    const only = x ?? y!, set = x ? va : vb;
    (out as any)[field] = set.has(field + ":" + (only as any).value) ? only : null;
  }
  const digits = (s: string) => s.replace(/\D/g, "");
  const full = (ps: Extraction["phone_numbers"], set: Set<string>) => ps.filter((p) => digits(p.value).length >= 10 && set.has("phone_numbers:" + p.value));
  const pa = full(a.phone_numbers, va), pb = full(b.phone_numbers, vb);
  const seen = new Set<string>();
  for (const p of [...pa, ...pb]) { const d = digits(p.value); if (!seen.has(d)) { seen.add(d); out.phone_numbers.push(p); } }
  return out;
}

if (process.argv[1] && /agree-label\.ts$/.test(process.argv[1])) {
  const dir = arg("in", "synth/realpool"), preds = arg("preds", "synth/runs/realpool");
  const meta = load(join(preds, "predictions_meta.jsonl")), deep = load(join(preds, "predictions_deepseek.jsonl"));
  const rows: unknown[] = [];
  const report: Record<string, string> = {};
  for (const name of readdirSync(join(dir, "jpg")).filter((n) => n.endsWith(".jpg")).sort()) {
    const id = name.replace(/\.jpg$/, "");
    const m = meta.get(id), d = deep.get(id);
    if (!m?.transcription || !d?.transcription || m.error || d.error) { report[id] = "a reader failed"; continue; }
    if (m.transcription.split(/\s+/).length < MIN_WORDS) { report[id] = "too short"; continue; }
    const x = agreed(normalizeExtraction(m.extraction ?? {}), normalizeExtraction(d.extraction ?? {}), m.transcription, d.transcription);
    if (!x) { report[id] = "readers disagree"; continue; }
    rows.push(...rowsFor(id, m.transcription.trim(), x, `file://${resolve(join(dir, "jpg", name))}`));
    report[id] = `agreed: ${x.kind}, ${verifyFacts(x, m.transcription).length} facts`;
  }
  const out = arg("out", "synth/realpool.jsonl");
  writeFileSync(out, rows.map((r) => JSON.stringify(r)).join("\n") + (rows.length ? "\n" : ""));
  for (const [id, r] of Object.entries(report)) console.log(id, "·", r);
  console.log(`${rows.length / 2} pages agreed → ${rows.length} rows in ${out}`);
}

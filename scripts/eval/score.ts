// Scores readers' raw outputs against the synthetic truth through Biscuit's own verifier and agreement rules.
//   npx tsx scripts/eval/score.ts --truth synth/holdout --preds synth/runs/eval,synth/runs/oct28a --out synth/runs/scores [--only dev_]
// A fact counts as right only when the reader cited it with a quote that is verbatim in its own transcription (the §2 rule)
// and the value agrees with the truth the way the agreement gate compares two readers. "Verified but wrong" is the number
// that matters most: facts Biscuit would have spoken that the page does not say.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { valuesAgree } from "../../server/agree.js";
import { matchHospital, statesFromText } from "../../server/hospitals.js";
import { normalizeExtraction, type Extraction } from "../../server/meta/spark.js";
import { MIN_WORDS } from "../../server/read.js";
import { normalize, verifyFacts, type Fact } from "../../server/verify.js";

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

type Truth = { id: string; template: string; kind: string; hospital: { ccn: string; name: string } | null; transcription: string; truth: Extraction };
type Pred = { id: string; transcription: string | null; extraction: unknown | null; msTranscribe: number; msExtract: number; error?: string };
export type Score = {
  reader: string; label: string; model: string; letters: number; read: number; kindRight: number; hospitalLetters: number; hospitalResolved: number;
  truthFacts: number; verbatim: number; right: number; missed: number; verifiedWrong: number; unverified: number; medianSeconds: number; p90Seconds: number;
  byField: Record<string, { truth: number; right: number; verifiedWrong: number }>; byTemplate: Record<string, { letters: number; read: number; right: number; truth: number }>;
};

const FIELDS = ["sender", "hospital_name", "amount_due", "statement_date", "due_date", "account_last4", "financial_assistance", "phone_numbers"];
const LABELS: Record<string, string> = { glimmer_base: "Glimmer 30B, base", glimmer_base_schema: "Glimmer 30B, base, schema in the prompt", glimmer_tuned: "Kindred's reader (Glimmer 30B, trained)", glimmer_r1: "Kindred's reader, round one (Oct 28)", glimmer_r2: "Kindred's reader, round two (Oct 29)" };
const median = (xs: number[]) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] : 0);
const p90 = (xs: number[]) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(xs.length * 0.9))] : 0);

function same(field: string, a: string, b: string): boolean {
  if (field === "financial_assistance") return a === b;
  return valuesAgree(field, a, b);
}

/** One letter, one reader: which truth facts the reader got right (cited, verified, agreeing), and what it said that the page does not. */
export function scoreLetter(t: Truth, p: Pred) {
  const transcription = p.transcription ?? "";
  const x = normalizeExtraction(p.extraction ?? {});
  const words = transcription.split(/\s+/).filter(Boolean).length;
  const read = words >= MIN_WORDS && Boolean(x.hospital_name?.value || x.sender?.value) && !p.error;
  const truthFacts: Fact[] = verifyFacts(normalizeExtraction(t.truth), t.transcription);
  // How much of the page the reader read: truth quotes that are verbatim in its transcription, whatever its extraction did.
  const page = normalize(transcription);
  const verbatim = truthFacts.filter((tf) => page.includes(normalize(tf.quote))).length;
  const facts: Fact[] = read ? verifyFacts(x, transcription) : [];
  const verified = facts.filter((f) => f.verified);
  let right = 0, verifiedWrong = 0;
  const byField: Record<string, { truth: number; right: number; verifiedWrong: number }> = {};
  const bump = (f: string, k: "truth" | "right" | "verifiedWrong") => { (byField[f] ??= { truth: 0, right: 0, verifiedWrong: 0 })[k]++; };
  for (const tf of truthFacts) {
    bump(tf.field, "truth");
    const hit = verified.find((f) => f.field === tf.field && same(tf.field, f.value, tf.value));
    if (hit) { right++; bump(tf.field, "right"); }
  }
  for (const f of verified) {
    const truthSame = truthFacts.find((tf) => tf.field === f.field && same(f.field, f.value, tf.value));
    if (!truthSame) { verifiedWrong++; bump(f.field, "verifiedWrong"); }
  }
  const name = x.hospital_name?.value || (x.kind === "bill" ? x.sender?.value : null);
  const resolved = t.hospital ? matchHospital(name ?? "", statesFromText(transcription))?.ccn === t.hospital.ccn : null;
  return { read, kindRight: read && x.kind === t.kind, truthFacts: truthFacts.length, verbatim, right, missed: truthFacts.length - right, verifiedWrong, unverified: facts.length - verified.length, resolved, seconds: (p.msTranscribe + p.msExtract) / 1000, byField };
}

export function scoreReader(name: string, meta: { label?: string; model?: string }, truths: Truth[], preds: Map<string, Pred>): Score {
  const s: Score = { reader: name, label: meta.label && meta.label !== name ? meta.label : LABELS[name] ?? name, model: meta.model ?? "", letters: 0, read: 0, kindRight: 0, hospitalLetters: 0, hospitalResolved: 0, truthFacts: 0, verbatim: 0, right: 0, missed: 0, verifiedWrong: 0, unverified: 0, medianSeconds: 0, p90Seconds: 0, byField: {}, byTemplate: {} };
  const secs: number[] = [];
  for (const t of truths) {
    const p = preds.get(t.id);
    if (!p) continue;
    const r = scoreLetter(t, p);
    s.letters++; s.read += r.read ? 1 : 0; s.kindRight += r.kindRight ? 1 : 0;
    if (t.hospital) { s.hospitalLetters++; s.hospitalResolved += r.resolved ? 1 : 0; }
    s.truthFacts += r.truthFacts; s.verbatim += r.verbatim; s.right += r.right; s.missed += r.missed; s.verifiedWrong += r.verifiedWrong; s.unverified += r.unverified;
    if (r.read) secs.push(r.seconds);
    for (const [f, v] of Object.entries(r.byField)) { const b = (s.byField[f] ??= { truth: 0, right: 0, verifiedWrong: 0 }); b.truth += v.truth; b.right += v.right; b.verifiedWrong += v.verifiedWrong; }
    const bt = (s.byTemplate[t.template] ??= { letters: 0, read: 0, right: 0, truth: 0 }); bt.letters++; bt.read += r.read ? 1 : 0; bt.right += r.right; bt.truth += r.truthFacts;
  }
  s.medianSeconds = Number(median(secs).toFixed(1)); s.p90Seconds = Number(p90(secs).toFixed(1));
  return s;
}

const pct = (a: number, b: number) => (b ? `${((100 * a) / b).toFixed(1)}%` : "n/a");

export function markdown(scores: Score[]): string {
  const lines = ["| Reader | Letters read | Lines read verbatim | Facts right | Verified but wrong | Unverified | Kind right | Hospital resolved | Median s | p90 s |", "|---|---|---|---|---|---|---|---|---|---|"];
  for (const s of scores) lines.push(`| ${s.label} | ${s.read}/${s.letters} | ${pct(s.verbatim, s.truthFacts)} | ${s.right}/${s.truthFacts} (${pct(s.right, s.truthFacts)}) | ${s.verifiedWrong} | ${s.unverified} | ${pct(s.kindRight, s.letters)} | ${s.hospitalResolved}/${s.hospitalLetters} | ${s.medianSeconds} | ${s.p90Seconds} |`);
  lines.push("", "Per field, facts right over facts on the page (verified but wrong in brackets):", "", `| Field | ${scores.map((s) => s.label).join(" | ")} |`, `|---|${scores.map(() => "---").join("|")}|`);
  for (const f of FIELDS) lines.push(`| ${f} | ${scores.map((s) => { const b = s.byField[f]; return b ? `${b.right}/${b.truth} [${b.verifiedWrong}]` : "n/a"; }).join(" | ")} |`);
  lines.push("", "Per template, letters read and facts right:", "", `| Template | ${scores.map((s) => s.label).join(" | ")} |`, `|---|${scores.map(() => "---").join("|")}|`);
  const templates = [...new Set(scores.flatMap((s) => Object.keys(s.byTemplate)))].sort();
  for (const t of templates) lines.push(`| ${t} | ${scores.map((s) => { const b = s.byTemplate[t]; return b ? `${b.read}/${b.letters} read · ${b.right}/${b.truth} right` : "n/a"; }).join(" | ")} |`);
  return lines.join("\n") + "\n";
}

if (process.argv[1] && /score\.ts$/.test(process.argv[1])) {
  const truthDir = join(arg("truth", "synth/holdout"), "truth");
  const truths: Truth[] = readdirSync(truthDir).filter((n) => n.endsWith(".json")).sort().map((n) => JSON.parse(readFileSync(join(truthDir, n), "utf8")));
  const scores: Score[] = [];
  for (const dir of arg("preds", "synth/runs/eval").split(",").filter(Boolean)) {
    if (!existsSync(dir)) continue;
    const only = arg("only", "");
    for (const file of readdirSync(dir).filter((n) => /^predictions_.*\.jsonl$/.test(n) && (!only || new RegExp(only).test(n))).sort()) {
      const name = file.replace(/^predictions_/, "").replace(/\.jsonl$/, "");
      const metaPath = join(dir, `reader_${name}.json`);
      const meta = existsSync(metaPath) ? JSON.parse(readFileSync(metaPath, "utf8")) : {};
      const preds = new Map<string, Pred>(readFileSync(join(dir, file), "utf8").split("\n").filter(Boolean).map((l) => { const p = JSON.parse(l) as Pred; return [p.id, p]; }));
      scores.push(scoreReader(name, meta, truths, preds));
    }
  }
  const out = arg("out", "synth/runs/scores");
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, "scores.json"), JSON.stringify(scores, null, 1));
  writeFileSync(join(out, "scores.md"), markdown(scores));
  process.stdout.write(markdown(scores));
}

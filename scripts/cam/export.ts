// Writes the labelled clips of every household that chose "Help improve Biscuit for everyone" into synth/cam-labels/
// (ignored by git): the box-region crops as JPEG files, labels.jsonl with one line per movement, and a manifest. It is
// de-identified: the household id is hashed, there is no device, no name and no address (Biscuit stores none), and the
// time is the hour. This is the dataset a later classifier or SAM prompt set would be fitted and measured on
// (docs/2026-10-29-mailbox-clips.md); nothing is trained here.
//   npx tsx scripts/cam/export.ts [--out synth/cam-labels]
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { eq, inArray } from "drizzle-orm";
import { isLabelled, POSITIVE } from "../../server/clips.js";
import { camSample, household } from "../../server/schema.js";

export type ExportSample = typeof camSample.$inferSelect;
export type ExportRow = { household: string; sample: number; at: string; label: string; positive: boolean; level: number | null; seen: string | null; scores: Record<string, number>; frames: string[] };

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

/** Sixteen hex characters of a salted SHA-256 of the household id: stable across exports, not the id, not reversible. */
export const deidentify = (householdId: string): string => createHash("sha256").update(`biscuit-cam-labels:${householdId}`).digest("hex").slice(0, 16);
const hour = (d: Date | string): string => { const t = new Date(d); t.setUTCMinutes(0, 0, 0); return t.toISOString(); };

/** Tapped, real movements only (no skipped, unchecked or test-run samples) as rows and crop files. */
export function exportRows(samples: ExportSample[]): { rows: ExportRow[]; files: { path: string; data: Buffer }[] } {
  const rows: ExportRow[] = [];
  const files: { path: string; data: Buffer }[] = [];
  for (const s of samples) {
    if (s.test || !isLabelled(s.label)) continue;
    const h = deidentify(s.householdId);
    const paths = s.frames.map((f, i) => {
      const path = `${h}/${s.id}-${i + 1}.jpg`;
      files.push({ path, data: Buffer.from(f.replace(/^data:image\/\w+;base64,/, ""), "base64") });
      return path;
    });
    rows.push({ household: h, sample: s.id, at: hour(s.at), label: s.label!, positive: POSITIVE.has(s.label!), level: s.level, seen: s.seen, scores: s.scores, frames: paths });
  }
  return { rows, files };
}

async function main() {
  const { config } = await import("dotenv");
  config({ path: ".env.local", override: true });
  const { getDb } = await import("../../server/db.js");
  const db = getDb();
  const out = arg("out", "synth/cam-labels");
  const homes = await db.select({ id: household.id }).from(household).where(eq(household.shareClips, true));
  const samples = homes.length ? await db.select().from(camSample).where(inArray(camSample.householdId, homes.map((h) => h.id))) : [];
  const { rows, files } = exportRows(samples);
  mkdirSync(out, { recursive: true });
  for (const f of files) { mkdirSync(join(out, dirname(f.path)), { recursive: true }); writeFileSync(join(out, f.path), f.data); }
  writeFileSync(join(out, "labels.jsonl"), rows.map((r) => JSON.stringify(r)).join("\n") + (rows.length ? "\n" : ""));
  const labels: Record<string, number> = {};
  for (const r of rows) labels[r.label] = (labels[r.label] ?? 0) + 1;
  const households = new Set(rows.map((r) => r.household)).size;
  writeFileSync(join(out, "manifest.json"), JSON.stringify({ exportedAt: new Date().toISOString(), households, movements: rows.length, positives: rows.filter((r) => r.positive).length, frames: files.length, labels }, null, 1));
  console.log(`${rows.length} labelled movements from ${households} household${households === 1 ? "" : "s"} that opted in, ${files.length} crops → ${out}`);
  process.exit(0);
}

if (process.argv[1] && /export\.ts$/.test(process.argv[1])) main().catch((e) => { console.error(e); process.exit(1); });

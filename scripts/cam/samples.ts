// Pulls the kept mailbox frames for the collect owner's household into synth/cam: samples.json for the calibration script
// and sheet.html, a contact sheet to label each movement (mail, carrier, nothing, other) and download labels.json.
//   npx tsx scripts/cam/samples.ts [--out synth/cam] [--labels synth/cam/labels.json --save]
// --save writes the labels in labels.json back onto the rows, so the sheet opens labelled next time.
import { config } from "dotenv";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { desc, eq } from "drizzle-orm";
import { getDb } from "../../server/db.js";
import { camSample, household } from "../../server/schema.js";

config({ path: ".env.local", override: true });

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function sheet(samples: { id: number; at: string; test: boolean; level: number | null; seen: string | null; scores: Record<string, number>; frames: string[]; label: string | null }[]): string {
  const LABELS = ["mail", "carrier", "nothing", "other"];
  const cards = samples.map((s) => `<article class="s" data-id="${s.id}">
  <header><strong>#${s.id}</strong> ${esc(new Date(s.at).toLocaleString())}${s.test ? " · test run" : ""} · level ${s.level ?? "?"} · seen: ${esc(s.seen ?? "nothing")}</header>
  <div class="frames">${s.frames.map((f) => `<img src="${f}" loading="lazy">`).join("")}</div>
  <div class="scores">${Object.entries(s.scores).map(([p, v]) => `<span class="${v >= 0.5 ? "hit" : ""}">${esc(p)} ${v.toFixed(2)}</span>`).join(" ")}</div>
  <div class="labels">${LABELS.map((l) => `<label><input type="radio" name="l${s.id}" value="${l}" ${s.label === l ? "checked" : ""}> ${l}</label>`).join(" ")}</div>
</article>`).join("\n");
  return `<!doctype html><html><head><meta charset="utf-8"><title>Mailbox frames</title><style>
body{font:15px -apple-system,Helvetica,Arial,sans-serif;margin:16px;color:#111;background:#f6f6f3}
.s{background:#fff;border:1px solid #ddd;border-radius:8px;padding:10px;margin:0 0 12px}
.frames img{height:180px;margin-right:6px;border:1px solid #ccc}
.scores span{display:inline-block;margin:4px 8px 0 0;font-family:ui-monospace,Menlo,monospace;font-size:13px;color:#555}
.scores .hit{color:#0b6b2b;font-weight:bold}
.labels label{margin-right:14px}
.bar{position:sticky;top:0;background:#fff;padding:10px;border-bottom:1px solid #ddd;margin:-16px -16px 12px}
button{font:inherit;padding:8px 14px}
</style></head><body>
<div class="bar"><strong>${samples.length} movements.</strong> Label each one, then <button id="dl">Download labels.json</button> and run <code>npx tsx scripts/cam/calibrate.ts</code>. mail = the carrier left something; carrier = a person at the box, nothing left; nothing = no mail (wind, light, a car, a passer-by); other = anything else.</div>
${cards}
<script>
document.getElementById("dl").onclick = () => {
  const out = {};
  for (const a of document.querySelectorAll(".s")) { const c = a.querySelector("input:checked"); if (c) out[a.dataset.id] = c.value; }
  const blob = new Blob([JSON.stringify(out, null, 1)], { type: "application/json" });
  const link = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: "labels.json" });
  link.click();
};
</script></body></html>`;
}

async function main() {
  const owner = process.env.CAM_COLLECT_OWNER?.trim().toLowerCase();
  if (!owner) throw new Error("CAM_COLLECT_OWNER is not set in .env.local");
  const db = getDb();
  const [home] = await db.select().from(household).where(eq(household.ownerEmail, owner)).limit(1);
  if (!home) throw new Error(`no household owned by ${owner}`);
  const out = arg("out", "synth/cam");
  mkdirSync(out, { recursive: true });
  const labelsPath = arg("labels", join(out, "labels.json"));
  const labels: Record<string, string> = existsSync(labelsPath) ? JSON.parse(readFileSync(labelsPath, "utf8")) : {};
  if (process.argv.includes("--save")) {
    let n = 0;
    for (const [id, label] of Object.entries(labels)) { await db.update(camSample).set({ label }).where(eq(camSample.id, Number(id))); n++; }
    console.log(`${n} labels saved`);
  }
  const rows = await db.select().from(camSample).where(eq(camSample.householdId, home.id)).orderBy(desc(camSample.at)).limit(2000);
  const samples = rows.map((r) => ({ id: r.id, at: r.at.toISOString(), test: r.test, level: r.level, seen: r.seen, scores: r.scores, frames: r.frames, label: labels[String(r.id)] ?? r.label }));
  writeFileSync(join(out, "samples.json"), JSON.stringify(samples.map(({ frames, ...rest }) => rest), null, 1));
  writeFileSync(join(out, "sheet.html"), sheet(samples));
  console.log(`${samples.length} samples for ${home.called}'s mailbox (${samples.filter((s) => s.label).length} labelled) → ${join(out, "samples.json")}, ${join(out, "sheet.html")}`);
  process.exit(0);
}

if (process.argv[1] && /samples\.ts$/.test(process.argv[1])) main().catch((e) => { console.error(e); process.exit(1); });

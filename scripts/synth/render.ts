// Renders synthetic letters as phone-like JPEGs with their truth files, deterministically from a seed.
//   npx tsx scripts/synth/render.ts --out synth --count 700 --holdout 100 --seed 1 --size 1500x2000 --jobs 6
// Letters 0..count-holdout-1 land in <out>/train, the rest in <out>/holdout; each gets jpg/<id>.jpg and truth/<id>.json.
// Needs Playwright's Chromium headless shell (CHROME_HEADLESS_SHELL to point elsewhere) and macOS sips for the JPEG.
import { execFile } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { makeLetter, TEMPLATES, type TemplateId } from "./letters.js";
import { familyFor, photoPage, type Frame } from "./photo.js";
import { mulberry32 } from "./rng.js";

const run = promisify(execFile);
export const SHELL = process.env.CHROME_HEADLESS_SHELL || `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell`;

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

export type Rendered = { id: string; seed: number; split: "train" | "holdout"; template: TemplateId; kind: string; jpg: string; truthPath: string; quality: number };

export async function renderOne(seed: number, split: "train" | "holdout", out: string, frame: Frame, worker: number, template?: TemplateId): Promise<Rendered> {
  const letter = makeLetter(seed, template);
  const rng = mulberry32(seed * 31 + 7);
  const quality = rng.int(58, 86);
  const dir = join(out, split);
  for (const d of ["html", "jpg", "truth"]) mkdirSync(join(dir, d), { recursive: true });
  const html = resolve(join(dir, "html", `${letter.id}.html`));
  const png = resolve(join(dir, "jpg", `${letter.id}.png`));
  const jpg = resolve(join(dir, "jpg", `${letter.id}.jpg`));
  const family = familyFor(seed);
  writeFileSync(html, photoPage(letter, seed, frame, family));
  const ud = join(tmpdir(), `biscuit-synth-ud${worker}`);
  await run(SHELL, ["--headless", "--disable-gpu", "--hide-scrollbars", "--no-sandbox", "--force-device-scale-factor=1", `--user-data-dir=${ud}`, `--window-size=${frame.w},${frame.h}`, `--screenshot=${png}`, `file://${html}`], { maxBuffer: 1 << 24 });
  await run("sips", ["-s", "format", "jpeg", "-s", "formatOptions", String(quality), png, "--out", jpg], { maxBuffer: 1 << 20 });
  rmSync(png, { force: true });
  const truthPath = resolve(join(dir, "truth", `${letter.id}.json`));
  writeFileSync(truthPath, JSON.stringify({ id: letter.id, seed, split, template: letter.template, kind: letter.kind, hospital: letter.hospital, lines: letter.lines, transcription: letter.transcription, truth: letter.truth, redacted: letter.redacted, family, quality, frame }, null, 1));
  return { id: letter.id, seed, split, template: letter.template, kind: letter.kind, jpg, truthPath, quality };
}

async function main() {
  const out = arg("out", "synth");
  const count = Number(arg("count", "700")), holdout = Number(arg("holdout", "100")), base = Number(arg("seed", "1")), jobs = Number(arg("jobs", "6"));
  const [w, h] = arg("size", "1500x2000").split("x").map(Number);
  const template = arg("template", "") as TemplateId | "";
  if (template && !TEMPLATES.includes(template)) throw new Error(`unknown template ${template}; one of ${TEMPLATES.join(", ")}`);
  if (!existsSync(SHELL)) throw new Error(`no headless shell at ${SHELL}; set CHROME_HEADLESS_SHELL`);
  const started = Date.now();
  let next = 0, done = 0;
  const results: Rendered[] = [];
  await Promise.all(Array.from({ length: jobs }, async (_, worker) => {
    while (next < count) {
      const i = next++;
      const r = await renderOne(base + i, i < count - holdout ? "train" : "holdout", out, { w, h }, worker, template || undefined);
      results.push(r);
      done++;
      if (done % 25 === 0 || done === count) process.stdout.write(`\r${done}/${count} rendered, ${((Date.now() - started) / 1000).toFixed(0)} s`);
    }
  }));
  const byTemplate: Record<string, number> = {};
  for (const r of results) byTemplate[r.template] = (byTemplate[r.template] ?? 0) + 1;
  console.log(`\n${results.length} letters in ${out}: ${JSON.stringify(byTemplate)}`);
}

if (process.argv[1] && /render\.ts$/.test(process.argv[1])) main().catch((e) => { console.error(e); process.exit(1); });

// Calibrates the mailbox watcher from the founder's own labelled frames: which SAM prompts see the mail and at what
// score floor, and how high the on-phone motion gate can go without losing deliveries. Nothing here is learned weights;
// it is the decision layer tuned on one mailbox, stated as such.
//   npx tsx scripts/cam/calibrate.ts [--samples synth/cam/samples.json] [--labels synth/cam/labels.json] [--out synth/cam/calibration.md]
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { COLLECT_PROMPTS, WATCH_PROMPTS } from "../../server/cam.js";

export type Sample = { id: number; at: string; test: boolean; level: number | null; seen: string | null; scores: Record<string, number>; label: string | null };
export type Point = { floor: number; hitRate: number; falseRate: number };
export type PromptStat = Point & { curve: Point[] };
export type SetStat = { prompts: string[]; hitRate: number; falseRate: number };
export type Report = { positives: number; negatives: number; unlabelled: number; prompts: Record<string, PromptStat>; set: SetStat; current: SetStat & { floor: number }; motion: { current: number; suggested: number; keptPositives: number; droppedNegatives: number }; markdown: string };

export const POSITIVE = new Set(["mail", "carrier"]);
export const NEGATIVE = new Set(["nothing", "other"]);
export const CURRENT_FLOOR = 0.5;
export const CURRENT_MOTION = 12;
const FLOORS = Array.from({ length: 13 }, (_, i) => Math.round((0.3 + i * 0.05) * 100) / 100);
const rate = <T>(xs: T[], f: (x: T) => boolean) => (xs.length ? xs.filter(f).length / xs.length : 0);

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

export function calibrate(samples: Sample[]): Report {
  const real = samples.filter((s) => !s.test);
  const pos = real.filter((s) => s.label && POSITIVE.has(s.label));
  const neg = real.filter((s) => s.label && NEGATIVE.has(s.label));
  const unlabelled = real.filter((s) => !s.label).length;
  const names = [...COLLECT_PROMPTS, ...new Set(real.flatMap((s) => Object.keys(s.scores)))].filter((p, i, a) => a.indexOf(p) === i);
  const score = (s: Sample, p: string) => s.scores[p] ?? 0;
  const prompts: Record<string, PromptStat> = {};
  for (const p of names) {
    const curve = FLOORS.map((floor) => ({ floor, hitRate: rate(pos, (s) => score(s, p) >= floor), falseRate: rate(neg, (s) => score(s, p) >= floor) }));
    const chosen = curve.find((c) => c.falseRate <= 0.1) ?? curve[curve.length - 1];
    prompts[p] = { ...chosen, curve };
  }
  const chosenPrompts = names.filter((p) => prompts[p].hitRate >= 0.5).sort((a, b) => prompts[b].hitRate - prompts[a].hitRate);
  const anyOf = (list: string[], floorOf: (p: string) => number): SetStat => ({ prompts: list, hitRate: rate(pos, (s) => list.some((p) => score(s, p) >= floorOf(p))), falseRate: rate(neg, (s) => list.some((p) => score(s, p) >= floorOf(p))) });
  const set = anyOf(chosenPrompts, (p) => prompts[p].floor);
  const current = { ...anyOf([...WATCH_PROMPTS], () => CURRENT_FLOOR), floor: CURRENT_FLOOR };
  const levels = pos.map((s) => s.level).filter((l): l is number => typeof l === "number" && Number.isFinite(l)).sort((a, b) => a - b);
  const tenth = levels.length ? levels[Math.floor(levels.length * 0.1)] : CURRENT_MOTION;
  const suggested = Math.max(CURRENT_MOTION, Math.round(tenth * 10) / 10);
  const negLevels = neg.map((s) => s.level).filter((l): l is number => typeof l === "number" && Number.isFinite(l));
  const motion = { current: CURRENT_MOTION, suggested, keptPositives: rate(levels, (l) => l >= suggested), droppedNegatives: rate(negLevels, (l) => l < suggested) };
  const report: Report = { positives: pos.length, negatives: neg.length, unlabelled, prompts, set, current, motion, markdown: "" };
  report.markdown = markdown(report);
  return report;
}

const pct = (x: number) => `${Math.round(x * 100)}%`;

export function markdown(r: Report): string {
  const lines = [
    `# Mailbox calibration`, ``,
    `${r.positives} labelled mail events, ${r.negatives} labelled non-events, ${r.unlabelled} not yet labelled. Test-run frames are left out.`, ``,
    `| Prompt | Floor | Sees the mail | False alarms |`, `|---|---|---|---|`,
    ...Object.entries(r.prompts).map(([p, s]) => `| ${p} | ${s.floor.toFixed(2)} | ${pct(s.hitRate)} | ${pct(s.falseRate)} |`), ``,
    `Today's watcher (${r.current.prompts.join(", ")} at ${r.current.floor.toFixed(2)}): sees ${pct(r.current.hitRate)} of the mail with ${pct(r.current.falseRate)} false alarms.`, ``,
    r.set.prompts.length ? `Suggested set (${r.set.prompts.join(", ")}, each at its own floor): sees ${pct(r.set.hitRate)} of the mail with ${pct(r.set.falseRate)} false alarms.` : `No prompt saw at least half the mail at a usable floor; keep today's set and collect more frames.`, ``,
    `Motion gate: today ${r.motion.current}; suggested ${r.motion.suggested} (keeps ${pct(r.motion.keptPositives)} of mail events, drops ${pct(r.motion.droppedNegatives)} of non-events before any frame leaves the phone).`, ``,
    `Apply: WATCH_PROMPTS and the score floor in server/cam.ts, the threshold in src/cam/motion.js.`,
  ];
  return lines.join("\n") + "\n";
}

if (process.argv[1] && /calibrate\.ts$/.test(process.argv[1])) {
  const samples: Sample[] = JSON.parse(readFileSync(arg("samples", "synth/cam/samples.json"), "utf8"));
  const labelsPath = arg("labels", "synth/cam/labels.json");
  const labels: Record<string, string> = existsSync(labelsPath) ? JSON.parse(readFileSync(labelsPath, "utf8")) : {};
  const report = calibrate(samples.map((s) => ({ ...s, label: labels[String(s.id)] ?? s.label })));
  writeFileSync(arg("out", "synth/cam/calibration.md"), report.markdown);
  process.stdout.write(report.markdown);
}

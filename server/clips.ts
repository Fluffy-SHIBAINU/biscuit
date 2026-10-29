// Mailbox clips: what a household that opted in keeps for each movement, Biscuit's guess on each clip, what Ana's taps
// teach that one mailbox, when Biscuit may classify a clip itself, and how long anything stays. No model is trained
// here. The taps tune the decision layer around SAM 3.1 the way scripts/cam/calibrate.ts does for the founder's frames,
// per household and on every tap, within what the taps can support; the guess and its confidence are that layer's
// reading of the scores, stated as numbers on the household's camera row.
import { and, eq, isNotNull, isNull, or, sql } from "drizzle-orm";
import { WATCH_PROMPTS } from "./cam.js";
import type { Db } from "./db.js";
import { cam, camSample, household, type Guess, type GuessLabel, type PromptStat, type Tuning } from "./schema.js";

/** A clip: up to eight region crops over about six seconds, each under about 60 KB on the phone (the server allows 64 KB). */
export const CLIP_FRAMES = 8;
export const CLIP_SPAN_MS = 6000;
export const MAX_CLIP_FRAME_BYTES = 64_000;
/** The phone fills a clip row within ten minutes of the movement, once; later or again is refused. */
export const CLIP_ATTACH_WINDOW_MS = 10 * 60_000;
/** Retention: unchecked (or skipped) clips go after seven days; tapped clips thirty days after the tap unless the household lets them into the export. */
export const UNLABELLED_DAYS = 7;
export const LABELLED_DAYS = 30;
/** The watcher's defaults: the SAM score at which an answer counts, and the phone's motion gate (src/cam/motion.js). */
export const DEFAULT_FLOOR = 0.5;
export const DEFAULT_GATE = 12;
/** Nothing is tuned below eight taps; the floor needs three taps of each kind, the gate three deliveries. */
export const TUNE_MIN_LABELS = 8;
export const TUNE_MIN_EACH = 3;

/** The words a tap or the contact sheet stores. mail and carrier are deliveries; nothing and other are not; skip is unchecked. */
export const LABELS = ["mail", "carrier", "nothing", "other", "skip"] as const;
export type Label = (typeof LABELS)[number];
export const POSITIVE: ReadonlySet<string> = new Set(["mail", "carrier"]);
export const NEGATIVE: ReadonlySet<string> = new Set(["nothing", "other"]);
export const FLOORS: readonly number[] = Array.from({ length: 13 }, (_, i) => Math.round((0.3 + i * 0.05) * 100) / 100);

export const isLabel = (v: unknown): v is Label => typeof v === "string" && (LABELS as readonly string[]).includes(v);
/** A tap that teaches: a skipped clip is unchecked, not labelled. */
export const isLabelled = (label: string | null | undefined): boolean => Boolean(label) && label !== "skip";
/** The stored word as one of the three guess labels: the sheet's "mail" is the carrier. */
export const asGuessLabel = (label: string | null | undefined): GuessLabel | null => (label === "mail" || label === "carrier" ? "carrier" : label === "nothing" || label === "other" ? label : null);

/** The guess. Version 1: the mapping below, a confidence from the margin over the floor tempered by the prompt's record here, never above 95 percent. */
export const GUESS_VERSION = 1;
export const MAX_CONFIDENCE = 0.95;
/** The pseudo-prompt for a clip on which nothing fired: its record is how often a quiet clip was tapped as not mail. */
export const NONE = "none";
/** What each prompt means before the taps say otherwise: the carrier prompts the carrier, a person alone someone else, nothing fired no mail. */
export const DEFAULT_MAPPING: Record<string, GuessLabel> = { "mail carrier": "carrier", "mail truck": "carrier", envelope: "carrier", person: "other", [NONE]: "nothing" };
/** Biscuit classifies a clip itself only at a well-taught box: twenty taps, the prompt right nine times in ten over ten or more, the guess at ninety percent or more. */
export const AUTO_MIN_TAPS = 20;
export const AUTO_MIN_FIRED = 10;
export const AUTO_MIN_PRECISION = 0.9;
export const AUTO_MIN_CONFIDENCE = 0.9;

export type TuneSample = { test: boolean; level: number | null; scores: Record<string, number>; label: string | null; labelledBy?: string | null; guess?: Guess | null };

const round2 = (n: number) => Math.round(n * 100) / 100;
const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/** What a prompt means at this box: the mapping the taps taught, else the default. */
export function mappingFor(prompt: string, tuning: Tuning | null | undefined): GuessLabel {
  return tuning?.prompts?.[prompt]?.label ?? DEFAULT_MAPPING[prompt] ?? "other";
}
/** The score at which a prompt counts here: its own raised floor, else the household's (the caller's base), else the default. */
export function floorFor(prompt: string, tuning: Tuning | null | undefined, base = DEFAULT_FLOOR): number {
  return tuning?.prompts?.[prompt]?.floor ?? base;
}
/** Whether a prompt may chime "mail came": always, unless the taps taught that at this box it means something other than the carrier. The default mapping of a person to someone else is a guess, not a lesson. */
export function chimesOn(prompt: string, tuning: Tuning | null | undefined): boolean {
  const stat = tuning?.prompts?.[prompt];
  return !(stat?.learned && stat.label !== "carrier");
}
/** How much a prompt's record here tempers a guess on it: (agreed + 1) / (fired + 1) once three clips rested on it; 1 before. */
const history = (stat: PromptStat | undefined): number => (stat && stat.fired >= TUNE_MIN_EACH ? (stat.agreed + 1) / (stat.fired + 1) : 1);

/**
 * Biscuit's guess for a clip from the first frame's scores. A carrier prompt above its floor means the carrier, the
 * strongest of them carrying the guess; otherwise the strongest other fired prompt and what it means here; nothing
 * above the floor means not mail. The confidence is the margin over (or under) the floor, scaled to 0.5 at the floor
 * and 1 at the far end, times the prompt's record here, capped at 95 percent.
 */
export function guessLabel(scores: Record<string, number> | null | undefined, tuning: Tuning | null | undefined, base = tuning?.floor ?? DEFAULT_FLOOR): Guess {
  const judged = WATCH_PROMPTS.map((prompt) => {
    const score = scores?.[prompt] ?? 0, floor = floorFor(prompt, tuning, base);
    const margin = clamp01((score - floor) / (1 - floor));
    return { prompt, score, floor, fired: score >= floor, label: mappingFor(prompt, tuning), confidence: (0.5 + 0.5 * margin) * history(tuning?.prompts?.[prompt]) };
  });
  const fired = judged.filter((j) => j.fired);
  if (!fired.length) {
    const margin = Math.min(...judged.map((j) => clamp01((j.floor - j.score) / j.floor)));
    return { label: "nothing", confidence: round2(Math.min(MAX_CONFIDENCE, (0.5 + 0.5 * margin) * history(tuning?.prompts?.[NONE]))), prompt: null, version: GUESS_VERSION };
  }
  const carriers = fired.filter((j) => j.label === "carrier");
  const top = (carriers.length ? carriers : fired).sort((a, b) => b.confidence - a.confidence)[0];
  return { label: top.label, confidence: round2(Math.min(MAX_CONFIDENCE, top.confidence)), prompt: top.prompt, version: GUESS_VERSION };
}

/** Whether Biscuit may put this guess on the clip as its label: the box is well taught and the prompt the guess rests on has earned it. */
export function autoClassifies(guess: Guess, tuning: Tuning | null | undefined): boolean {
  if (!tuning || tuning.taps < AUTO_MIN_TAPS) return false;
  const stat = tuning.prompts?.[guess.prompt ?? NONE];
  return Boolean(stat && stat.label === guess.label && stat.fired >= AUTO_MIN_FIRED && (stat.precision ?? 0) >= AUTO_MIN_PRECISION && guess.confidence >= AUTO_MIN_CONFIDENCE);
}

const rate = <T>(xs: T[], f: (x: T) => boolean) => (xs.length ? xs.filter(f).length / xs.length : 0);
/** The best watch-prompt score on the first frame: what the watcher would have judged. */
const top = (s: TuneSample) => Math.max(0, ...WATCH_PROMPTS.map((p) => s.scores?.[p] ?? 0));
const finite = (l: number | null | undefined): l is number => typeof l === "number" && Number.isFinite(l);

/**
 * What the taps support. Floor: the lowest of the grid at which the watch prompts, together, raise a false alarm on at
 * most one non-delivery in ten; not applied if it would lose more than half the deliveries. Gate: the motion level nine
 * deliveries in ten still clear, never below the default. `caught` and `falseAlarms` say how the tapped movements fare
 * under what is applied (the defaults where nothing is). Then each prompt's record: the clips whose guess rested on it
 * that Ana checked (a tap, or Not right), how many agreed with what the prompt means here, a mapping learned when a
 * majority of three or more taps says a non-carrier prompt means something else at this box, and a raised floor when
 * the prompt is right less than half the time (the lowest grid floor above the household's at which it is right at
 * least half the time, else 0.90). Only Ana's taps teach; Biscuit's own classifications are counted apart.
 */
export function tune(samples: TuneSample[], now = new Date()): Tuning {
  const real = samples.filter((s) => !s.test);
  const ana = real.filter((s) => s.labelledBy !== "biscuit");
  const tapped = ana.filter((s) => isLabelled(s.label));
  const rejected = ana.filter((s) => !isLabelled(s.label) && Boolean(s.guess?.rejected));
  const pos = tapped.filter((s) => POSITIVE.has(s.label!));
  const neg = tapped.filter((s) => NEGATIVE.has(s.label!));
  const taps = tapped.length + rejected.length;
  let floor: number | null = null;
  let gate: number | null = null;
  if (taps >= TUNE_MIN_LABELS) {
    if (pos.length >= TUNE_MIN_EACH && neg.length >= TUNE_MIN_EACH) {
      const curve = FLOORS.map((f) => ({ f, hit: rate(pos, (s) => top(s) >= f), falseRate: rate(neg, (s) => top(s) >= f) }));
      const chosen = curve.find((c) => c.falseRate <= 0.1) ?? curve[curve.length - 1];
      if (chosen.hit >= 0.5) floor = chosen.f;
    }
    const levels = pos.map((s) => s.level).filter(finite).sort((a, b) => a - b);
    if (levels.length >= TUNE_MIN_EACH) gate = Math.max(DEFAULT_GATE, Math.round(levels[Math.floor(levels.length * 0.1)] * 10) / 10);
  }
  const f = floor ?? DEFAULT_FLOOR, g = gate ?? DEFAULT_GATE;
  const chimes = (s: TuneSample) => (!finite(s.level) || s.level >= g) && top(s) >= f;
  // Each prompt's record. A clip kept before guesses were stored is judged as the watcher would judge it now.
  const restsOn = (s: TuneSample) => (s.guess ?? guessLabel(s.scores, null, f)).prompt ?? NONE;
  const checked = [...tapped, ...rejected];
  const prompts: Record<string, PromptStat> = {};
  for (const p of [...WATCH_PROMPTS, NONE]) {
    const mine = checked.filter((s) => restsOn(s) === p);
    const labelled = mine.filter((s) => isLabelled(s.label));
    let label = DEFAULT_MAPPING[p];
    let learned = false;
    if (p !== NONE && label !== "carrier" && taps >= TUNE_MIN_LABELS && labelled.length >= TUNE_MIN_EACH) {
      const tally = new Map<GuessLabel, number>();
      for (const s of labelled) { const l = asGuessLabel(s.label)!; tally.set(l, (tally.get(l) ?? 0) + 1); }
      const [best, n] = [...tally.entries()].sort((a, b) => b[1] - a[1])[0];
      if (n * 2 > labelled.length && best !== label) { label = best; learned = true; }
    }
    const agrees = (s: TuneSample) => isLabelled(s.label) && asGuessLabel(s.label) === label;
    const agreed = mine.filter(agrees).length;
    const precision = mine.length ? agreed / mine.length : null;
    let own: number | null = null;
    if (p !== NONE && taps >= TUNE_MIN_LABELS && mine.length >= TUNE_MIN_EACH && precision !== null && precision < 0.5) {
      own = FLOORS[FLOORS.length - 1];
      for (const cand of FLOORS) {
        if (cand <= f) continue;
        const sub = mine.filter((s) => (s.scores?.[p] ?? 0) >= cand);
        if (sub.length && sub.filter(agrees).length / sub.length >= 0.5) { own = cand; break; }
      }
    }
    prompts[p] = { label, learned, floor: own, fired: mine.length, agreed, precision };
  }
  const autos = real.filter((s) => s.guess?.auto);
  const corrected = autos.filter((s) => (isLabelled(s.label) ? asGuessLabel(s.label) !== s.guess!.label : Boolean(s.guess!.rejected))).length;
  return { taps, positives: pos.length, negatives: neg.length, floor, gate, caught: pos.filter(chimes).length, falseAlarms: neg.filter(chimes).length, at: now.toISOString(), prompts, auto: { classified: autos.length, corrected } };
}

/** Recomputes a household's floor, gate and prompt records from every sample Ana checked (and Biscuit's own, counted apart) and stores them on its camera row. */
export async function tuneHousehold(db: Db, householdId: string, now = new Date()): Promise<Tuning> {
  const rows = await db.select({ test: camSample.test, level: camSample.level, scores: camSample.scores, label: camSample.label, labelledBy: camSample.labelledBy, guess: camSample.guess }).from(camSample).where(and(eq(camSample.householdId, householdId), or(isNotNull(camSample.label), isNotNull(camSample.labelledBy))));
  const t = tune(rows, now);
  await db.update(cam).set({ floor: t.floor, gate: t.gate, tuning: t }).where(eq(cam.householdId, householdId));
  return t;
}

/** Retention for clips (never the founder's collect-mode frames). Returns how many went. */
export async function retireClips(db: Db, now = new Date()): Promise<number> {
  const unchecked = new Date(now.getTime() - UNLABELLED_DAYS * 86_400_000);
  const tapped = new Date(now.getTime() - LABELLED_DAYS * 86_400_000);
  const r: any = await db.execute(sql`delete from ${camSample} where ${camSample.clip} and ${camSample.id} in (
    select s.id from ${camSample} s join ${household} h on h.id = s.household_id
    where s.clip and (((s.label is null or s.label = 'skip') and s.at < ${unchecked})
      or (s.label is not null and s.label <> 'skip' and not h.share_clips and coalesce(s.labelled_at, s.at) < ${tapped})))`);
  return Number(r?.rowCount ?? 0);
}

/** Keeping clips turned off: every clip goes, or only the unchecked ones while the household still lets tapped clips into the export. Returns how many went. */
export async function dropClips(db: Db, householdId: string, keepTapped: boolean): Promise<number> {
  const rows = await db.delete(camSample).where(and(eq(camSample.householdId, householdId), eq(camSample.clip, true), keepTapped ? or(isNull(camSample.label), eq(camSample.label, "skip")) : undefined)).returning({ id: camSample.id });
  return rows.length;
}

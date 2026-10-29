// Mailbox clips: what a household that opted in keeps for each movement, what Ana's taps teach that one mailbox, and how
// long anything stays. No model is trained here. The taps tune the decision layer around SAM 3.1 the way
// scripts/cam/calibrate.ts does for the founder's frames, per household and on every tap, within what the taps can support.
import { and, eq, isNotNull, isNull, or, sql } from "drizzle-orm";
import { WATCH_PROMPTS } from "./cam.js";
import type { Db } from "./db.js";
import { cam, camSample, household, type Tuning } from "./schema.js";

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

export type TuneSample = { test: boolean; level: number | null; scores: Record<string, number>; label: string | null };

const rate = <T>(xs: T[], f: (x: T) => boolean) => (xs.length ? xs.filter(f).length / xs.length : 0);
/** The best watch-prompt score on the first frame: what the watcher would have judged. */
const top = (s: TuneSample) => Math.max(0, ...WATCH_PROMPTS.map((p) => s.scores?.[p] ?? 0));
const finite = (l: number | null | undefined): l is number => typeof l === "number" && Number.isFinite(l);

/**
 * The floor and gate the taps support. Floor: the lowest of the grid at which the watch prompts, together, raise a
 * false alarm on at most one non-delivery in ten; not applied if it would lose more than half the deliveries. Gate: the
 * motion level nine deliveries in ten still clear, never below the default. `caught` and `falseAlarms` say how the
 * tapped movements fare under what is applied (the defaults where nothing is).
 */
export function tune(samples: TuneSample[], now = new Date()): Tuning {
  const real = samples.filter((s) => !s.test && isLabelled(s.label));
  const pos = real.filter((s) => POSITIVE.has(s.label!));
  const neg = real.filter((s) => NEGATIVE.has(s.label!));
  const taps = pos.length + neg.length;
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
  return { taps, positives: pos.length, negatives: neg.length, floor, gate, caught: pos.filter(chimes).length, falseAlarms: neg.filter(chimes).length, at: now.toISOString() };
}

/** Recomputes a household's floor and gate from every labelled sample it has and stores them on its camera row. */
export async function tuneHousehold(db: Db, householdId: string, now = new Date()): Promise<Tuning> {
  const rows = await db.select({ test: camSample.test, level: camSample.level, scores: camSample.scores, label: camSample.label }).from(camSample).where(and(eq(camSample.householdId, householdId), isNotNull(camSample.label)));
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

import type { Box, Detection } from "./meta/sam.js";
import type { Region, RegionSource } from "./schema.js";

const r3 = (n: number) => Math.round(n * 1000) / 1000;

/** The watched region: the confirmed box grown by 20 percent of its own size on each side, clamped to the frame. */
export function padRegion(box: Box, pad = 0.2): Region {
  const px = box.w * pad, py = box.h * pad;
  const x = Math.max(0, box.x - px), y = Math.max(0, box.y - py);
  const right = Math.min(1, box.x + box.w + px), bottom = Math.min(1, box.y + box.h + py);
  return { x: r3(x), y: r3(y), w: r3(right - x), h: r3(bottom - y) };
}

/** The `source` a region save names: "sam" or "hand"; null when the phone sends none (the older page); undefined for anything else. */
export function regionSourceOf(v: unknown): RegionSource | null | undefined {
  if (v === undefined || v === null) return null;
  return v === "sam" || v === "hand" ? v : undefined;
}

export function bestDetection(d: Detection[], minScore = 0.5): Detection | null {
  const best = [...d].sort((a, b) => b.score - a.score)[0];
  return best && best.score >= minScore ? best : null;
}

export const SAM_DAILY_CAP = 800;

/** False once today's SAM calls reach the cap; a new day resets the count. */
export function allowSamCall(row: { samCallsToday: number; samDay: string | null }, today: string): boolean {
  if (row.samDay !== today) return true;
  return row.samCallsToday < SAM_DAILY_CAP;
}

/** What the watcher asks SAM 3.1 for, in order: the carrier first, then a person at the box, the mail truck, an envelope. The chime fires on any. */
export const WATCH_PROMPTS = ["mail carrier", "person", "mail truck", "envelope"] as const;

/** The prompts scored on a kept frame, so calibration can compare them; the watch prompts first. */
export const COLLECT_PROMPTS = [...WATCH_PROMPTS, "mailbox door", "hand", "package"] as const;

/** The founder's household: the one whose owner CAM_COLLECT_OWNER names. Collect mode is allowed for it, and Ana's page opens its Details for it. */
export function isCollectOwner(env: Record<string, string | undefined>, ownerEmail: string | null | undefined): boolean {
  const owner = env.CAM_COLLECT_OWNER?.trim().toLowerCase();
  return Boolean(owner && ownerEmail && ownerEmail.trim().toLowerCase() === owner);
}

/** Frames may be kept only for the household whose owner CAM_COLLECT_OWNER names, and only when the phone asks on that send. */
export function collectAllowed(env: Record<string, string | undefined>, ownerEmail: string | null | undefined, asked: string | null | undefined): boolean {
  return isCollectOwner(env, ownerEmail) && asked === "1";
}

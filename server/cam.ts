import type { Box, Detection } from "./meta/sam.js";
import type { Region } from "./schema.js";

const r3 = (n: number) => Math.round(n * 1000) / 1000;

/** The watched region: the confirmed box grown by 20 percent of its own size on each side, clamped to the frame. */
export function padRegion(box: Box, pad = 0.2): Region {
  const px = box.w * pad, py = box.h * pad;
  const x = Math.max(0, box.x - px), y = Math.max(0, box.y - py);
  const right = Math.min(1, box.x + box.w + px), bottom = Math.min(1, box.y + box.h + py);
  return { x: r3(x), y: r3(y), w: r3(right - x), h: r3(bottom - y) };
}

export function bestDetection(d: Detection[], minScore = 0.5): Detection | null {
  const best = [...d].sort((a, b) => b.score - a.score)[0];
  return best && best.score >= minScore ? best : null;
}

export const SAM_DAILY_CAP = 400;

/** False once today's SAM calls reach the cap; a new day resets the count. */
export function allowSamCall(row: { samCallsToday: number; samDay: string | null }, today: string): boolean {
  if (row.samDay !== today) return true;
  return row.samCallsToday < SAM_DAILY_CAP;
}

export const WATCH_PROMPTS = ["mail carrier", "mailbox door", "envelope"] as const;
export const TEST_PROMPTS = ["mailbox door"] as const;

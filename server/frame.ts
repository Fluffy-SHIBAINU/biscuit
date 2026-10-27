import type { Detection } from "./meta/sam.js";

export type FrameCheck = { ok: boolean; coverage: number; cutEdge: "top" | "bottom" | "left" | "right" | null };
export const MIN_COVERAGE = 0.35;
const EDGE = 0.01;

/** A whole letter is in view when the best box covers 35 percent of the frame and touches no edge. */
export function frameCheck(detections: Detection[]): FrameCheck {
  const best = [...detections].sort((a, b) => b.score - a.score)[0];
  if (!best) return { ok: false, coverage: 0, cutEdge: null };
  const { x, y, w, h } = best.box;
  const coverage = Math.round(w * h * 100) / 100;
  const cutEdge = y <= EDGE ? "top" : y + h >= 1 - EDGE ? "bottom" : x <= EDGE ? "left" : x + w >= 1 - EDGE ? "right" : null;
  return { ok: coverage >= MIN_COVERAGE && cutEdge === null, coverage, cutEdge };
}

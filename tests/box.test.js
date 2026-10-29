import { expect, test } from "vitest";
import { boxFrom, clampBox, dragBox, finishDraw, HANDLE_PX, hitTest, isTap, MIN_SIDE, pointIn, roundBox, TAP_PX } from "../src/cam/box.js";

// The box drawn by hand over the live preview: normalised to the frame, clamped to it, never smaller than a tenth of it a side.
const SIZE = { width: 400, height: 500 };
const BOX = { x: 0.2, y: 0.2, w: 0.4, h: 0.4 };
const near = (box, want) => { for (const k of ["x", "y", "w", "h"]) expect(box[k]).toBeCloseTo(want[k]); };

test("the constants: a tenth of the frame a side, a 28-pixel handle, a 10-pixel tap", () => {
  expect(MIN_SIDE).toBe(0.1);
  expect(HANDLE_PX).toBe(28);
  expect(TAP_PX).toBe(10);
});

test("pointIn turns a client position into a normalised point of the frame, clamped to it", () => {
  const rect = { left: 10, top: 20, width: 200, height: 100 };
  expect(pointIn(rect, 110, 70)).toEqual({ x: 0.5, y: 0.5 });
  expect(pointIn(rect, 10, 20)).toEqual({ x: 0, y: 0 });
  expect(pointIn(rect, 0, 0)).toEqual({ x: 0, y: 0 });
  expect(pointIn(rect, 500, 500)).toEqual({ x: 1, y: 1 });
  expect(pointIn(rect, 60, 95)).toEqual({ x: 0.25, y: 0.75 });
});

test("boxFrom spans two points in either order", () => {
  near(boxFrom({ x: 0.2, y: 0.3 }, { x: 0.6, y: 0.8 }), { x: 0.2, y: 0.3, w: 0.4, h: 0.5 });
  near(boxFrom({ x: 0.6, y: 0.8 }, { x: 0.2, y: 0.3 }), { x: 0.2, y: 0.3, w: 0.4, h: 0.5 });
  near(boxFrom({ x: 0.6, y: 0.3 }, { x: 0.2, y: 0.8 }), { x: 0.2, y: 0.3, w: 0.4, h: 0.5 });
  expect(boxFrom({ x: 0.5, y: 0.5 }, { x: 0.5, y: 0.5 })).toEqual({ x: 0.5, y: 0.5, w: 0, h: 0 });
});

test("clampBox keeps a good box, grows a small one around its centre, and pushes a spilling one back inside the frame", () => {
  expect(clampBox(BOX)).toEqual(BOX);
  near(clampBox({ x: 0.5, y: 0.5, w: 0.02, h: 0.04 }), { x: 0.46, y: 0.47, w: 0.1, h: 0.1 });
  near(clampBox({ x: 0.95, y: 0.95, w: 0.2, h: 0.2 }), { x: 0.8, y: 0.8, w: 0.2, h: 0.2 });
  near(clampBox({ x: -0.1, y: -0.1, w: 0.3, h: 0.3 }), { x: 0, y: 0, w: 0.3, h: 0.3 });
  expect(clampBox({ x: -0.5, y: 0, w: 2, h: 1.5 })).toEqual({ x: 0, y: 0, w: 1, h: 1 });
  const corner = clampBox({ x: 0.98, y: 0.99, w: 0, h: 0 });
  expect(corner.x + corner.w).toBeLessThanOrEqual(1);
  expect(corner.y + corner.h).toBeLessThanOrEqual(1);
  expect(corner.w).toBeCloseTo(0.1);
  expect(corner.h).toBeCloseTo(0.1);
});

test("hitTest names the corner handle within 28 pixels, the inside, or nothing", () => {
  expect(hitTest(BOX, { x: 0.21, y: 0.21 }, SIZE)).toBe("nw");
  expect(hitTest(BOX, { x: 0.6, y: 0.22 }, SIZE)).toBe("ne");
  expect(hitTest(BOX, { x: 0.19, y: 0.61 }, SIZE)).toBe("sw");
  expect(hitTest(BOX, { x: 0.62, y: 0.58 }, SIZE)).toBe("se");
  expect(hitTest(BOX, { x: 0.4, y: 0.4 }, SIZE)).toBe("move");
  expect(hitTest(BOX, { x: 0.8, y: 0.8 }, SIZE)).toBeNull();
  expect(hitTest(BOX, { x: 0.05, y: 0.05 }, SIZE)).toBeNull();
  // 24 pixels from the corner hits it; 32 pixels inside is a move, 32 pixels outside is nothing.
  expect(hitTest(BOX, { x: 0.26, y: 0.2 }, SIZE)).toBe("nw");
  expect(hitTest(BOX, { x: 0.28, y: 0.3 }, SIZE)).toBe("move");
  expect(hitTest(BOX, { x: 0.12, y: 0.2 }, SIZE)).toBeNull();
  // The nearest corner wins when a small box puts two within reach.
  expect(hitTest({ x: 0.2, y: 0.2, w: 0.1, h: 0.1 }, { x: 0.29, y: 0.21 }, SIZE)).toBe("ne");
  expect(hitTest(null, { x: 0.4, y: 0.4 }, SIZE)).toBeNull();
});

test("dragBox moves the whole box by the finger's travel and stops at the frame", () => {
  near(dragBox(BOX, "move", { x: 0.4, y: 0.4 }, { x: 0.5, y: 0.45 }), { x: 0.3, y: 0.25, w: 0.4, h: 0.4 });
  near(dragBox(BOX, "move", { x: 0.4, y: 0.4 }, { x: 0.9, y: 0.9 }), { x: 0.6, y: 0.6, w: 0.4, h: 0.4 });
  near(dragBox(BOX, "move", { x: 0.4, y: 0.4 }, { x: 0, y: 0 }), { x: 0, y: 0, w: 0.4, h: 0.4 });
});

test("dragBox resizes from a corner, never under the minimum, never past the frame", () => {
  near(dragBox(BOX, "se", { x: 0.6, y: 0.6 }, { x: 0.7, y: 0.75 }), { x: 0.2, y: 0.2, w: 0.5, h: 0.55 });
  near(dragBox(BOX, "se", { x: 0.6, y: 0.6 }, { x: 0.1, y: 0.1 }), { x: 0.2, y: 0.2, w: 0.1, h: 0.1 });
  near(dragBox(BOX, "nw", { x: 0.2, y: 0.2 }, { x: 0.1, y: 0.15 }), { x: 0.1, y: 0.15, w: 0.5, h: 0.45 });
  near(dragBox(BOX, "nw", { x: 0.2, y: 0.2 }, { x: 0.9, y: 0.9 }), { x: 0.5, y: 0.5, w: 0.1, h: 0.1 });
  near(dragBox(BOX, "ne", { x: 0.6, y: 0.2 }, { x: 0.7, y: 0.1 }), { x: 0.2, y: 0.1, w: 0.5, h: 0.5 });
  near(dragBox(BOX, "sw", { x: 0.2, y: 0.6 }, { x: 0.1, y: 0.7 }), { x: 0.1, y: 0.2, w: 0.5, h: 0.5 });
  // Grabbed a little inside the handle: the corner moves by the travel, and stops at the frame's edge.
  near(dragBox(BOX, "se", { x: 0.55, y: 0.55 }, { x: 1, y: 1 }), { x: 0.2, y: 0.2, w: 0.8, h: 0.8 });
  near(dragBox(BOX, "nw", { x: 0.25, y: 0.25 }, { x: 0, y: 0 }), { x: 0, y: 0, w: 0.6, h: 0.6 });
});

test("isTap: under ten pixels of travel is a tap, not a draw", () => {
  expect(isTap({ x: 0.5, y: 0.5 }, { x: 0.51, y: 0.5 }, SIZE)).toBe(true);
  expect(isTap({ x: 0.5, y: 0.5 }, { x: 0.5, y: 0.5 }, SIZE)).toBe(true);
  expect(isTap({ x: 0.5, y: 0.5 }, { x: 0.55, y: 0.5 }, SIZE)).toBe(false);
  expect(isTap({ x: 0.5, y: 0.5 }, { x: 0.5, y: 0.515 }, SIZE)).toBe(true);
  expect(isTap({ x: 0.5, y: 0.5 }, { x: 0.5, y: 0.53 }, SIZE)).toBe(false);
});

test("finishDraw: a tap draws nothing, a drag draws the clamped box", () => {
  expect(finishDraw({ x: 0.5, y: 0.5 }, { x: 0.51, y: 0.505 }, SIZE)).toBeNull();
  near(finishDraw({ x: 0.3, y: 0.3 }, { x: 0.7, y: 0.6 }, SIZE), { x: 0.3, y: 0.3, w: 0.4, h: 0.3 });
  near(finishDraw({ x: 0.7, y: 0.32 }, { x: 0.3, y: 0.3 }, SIZE), { x: 0.3, y: 0.26, w: 0.4, h: 0.1 });
});

test("roundBox keeps three decimals, as the server stores the region", () => {
  expect(roundBox({ x: 0.123456, y: 0.9999, w: 0.33333, h: 0.1 })).toEqual({ x: 0.123, y: 1, w: 0.333, h: 0.1 });
});

// The preview is object-fit: cover, so the frame shows a cropped, scaled video. A box lives in the video's own
// coordinates (what the watcher crops); drawing and hit-testing happen in the frame's. These map between the two.
import { coverFit, FRAME, frameToVideo, frameToVideoBox, regionStyle, videoToFrame } from "../src/cam/box.js";
const PORTRAIT = { width: 1440, height: 1920 };
const LANDSCAPE = { width: 1920, height: 1440 };

test("coverFit: the scale and offset of the video inside the frame", () => {
  const p = coverFit(SIZE, PORTRAIT);
  expect(p.scale).toBeCloseTo(400 / 1440);
  expect(p.ox).toBeCloseTo(0);
  expect(p.oy).toBeCloseTo((500 - 1920 * (400 / 1440)) / 2);
  const l = coverFit(SIZE, LANDSCAPE);
  expect(l.scale).toBeCloseTo(500 / 1440);
  expect(l.ox).toBeCloseTo((400 - 1920 * (500 / 1440)) / 2);
  expect(l.oy).toBeCloseTo(0);
  expect(FRAME).toEqual({ width: 4, height: 5 });
});

test("frameToVideo maps a point of the frame into the video, and is the identity with no video size", () => {
  const near2 = (p, want) => { expect(p.x).toBeCloseTo(want.x); expect(p.y).toBeCloseTo(want.y); };
  near2(frameToVideo({ x: 0.5, y: 0 }, SIZE, PORTRAIT), { x: 0.5, y: 0.03125 });
  near2(frameToVideo({ x: 1, y: 1 }, SIZE, PORTRAIT), { x: 1, y: 0.96875 });
  near2(frameToVideo({ x: 0, y: 0.5 }, SIZE, LANDSCAPE), { x: 0.2, y: 0.5 });
  near2(frameToVideo({ x: 1, y: 1 }, SIZE, LANDSCAPE), { x: 0.8, y: 1 });
  expect(frameToVideo({ x: 0.3, y: 0.7 }, SIZE, null)).toEqual({ x: 0.3, y: 0.7 });
});

test("videoToFrame draws a video box where the frame shows it, spilling past the frame where the video is cropped", () => {
  near(videoToFrame({ x: 0, y: 0, w: 1, h: 1 }, SIZE, PORTRAIT), { x: 0, y: -1 / 30, w: 1, h: 1 + 1 / 15 });
  near(videoToFrame({ x: 0.2, y: 0, w: 0.6, h: 1 }, SIZE, LANDSCAPE), { x: 0, y: 0, w: 1, h: 1 });
  expect(videoToFrame(BOX, SIZE, null)).toEqual(BOX);
  const drawn = { x: 0.1, y: 0.2, w: 0.5, h: 0.25 };
  near(videoToFrame(frameToVideoBox(drawn, SIZE, PORTRAIT), SIZE, PORTRAIT), drawn);
  near(videoToFrame(frameToVideoBox(drawn, SIZE, LANDSCAPE), SIZE, LANDSCAPE), drawn);
  near(frameToVideoBox({ x: 0, y: 0, w: 1, h: 1 }, SIZE, LANDSCAPE), { x: 0.2, y: 0, w: 0.6, h: 1 });
});

test("regionStyle gives the CSS percentages for a video box over the 4:5 frame", () => {
  expect(regionStyle({ x: 0.1, y: 0.2, w: 0.5, h: 0.25 }, null)).toEqual({ left: "10%", top: "20%", width: "50%", height: "25%" });
  const s = regionStyle({ x: 0.1, y: 0.2, w: 0.5, h: 0.25 }, PORTRAIT);
  expect(s.left).toBe("10%");
  expect(s.width).toBe("50%");
  expect(parseFloat(s.top)).toBeCloseTo(18);
  expect(parseFloat(s.height)).toBeCloseTo(26.667, 2);
});

import { videoSizeOf } from "../src/cam/box.js";
test("videoSizeOf reads the video element's own size once it has one", () => {
  expect(videoSizeOf(null)).toBeNull();
  expect(videoSizeOf({ videoWidth: 0, videoHeight: 0 })).toBeNull();
  expect(videoSizeOf({ videoWidth: 1440, videoHeight: 1920 })).toEqual({ width: 1440, height: 1920 });
});

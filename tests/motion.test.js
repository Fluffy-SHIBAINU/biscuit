import { expect, test } from "vitest";
import { FROZEN_SAMPLES, MotionDetector, meanAbsDiff, toGray } from "../src/cam/motion.js";

test("meanAbsDiff and toGray", () => {
  expect(meanAbsDiff(new Uint8Array([10, 20]), new Uint8Array([20, 40]))).toBe(15);
  const rgba = new Uint8ClampedArray(2 * 2 * 4).fill(255);
  const gray = toGray(rgba, 2, 2, { x: 0, y: 0, w: 1, h: 1 }, 2);
  expect(gray.length).toBe(4);
  expect(gray[0]).toBe(255);
});

test("motion needs two consecutive samples then cools down", () => {
  const m = new MotionDetector();
  const still = new Uint8Array(100).fill(10);
  const moved = new Uint8Array(100).fill(40);
  expect(m.sample(still, 0)).toBe("idle");
  expect(m.sample(moved, 500)).toBe("idle");
  expect(m.sample(still, 1000)).toBe("motion");
  expect(m.sample(moved, 1500)).toBe("cooldown");
  expect(m.sample(still, 92_000)).toBe("motion");
});

import { shouldSend } from "../src/cam/watch.js";
test("shouldSend", () => {
  expect(shouldSend({ paused: false, battery: null, charging: null })).toBe(true);
  expect(shouldSend({ paused: true, battery: 80, charging: true })).toBe(false);
  expect(shouldSend({ paused: false, battery: 9, charging: false })).toBe(false);
  expect(shouldSend({ paused: false, battery: 9, charging: true })).toBe(true);
});

// Calibration needs the level that tripped the gate, so the detector remembers its last difference.
test("the detector keeps the last difference it measured", () => {
  const d = new MotionDetector({ threshold: 12, consecutive: 1, cooldownMs: 0 });
  const a = new Uint8Array([0, 0, 0, 0]), b = new Uint8Array([20, 20, 20, 20]);
  expect(d.lastDiff).toBe(0);
  d.sample(a, 1000);
  expect(d.lastDiff).toBe(0);
  expect(d.sample(b, 2000)).toBe("motion");
  expect(d.lastDiff).toBe(20);
});

// Cadence: the phone samples every 500 ms and needs two samples in a row; after a send, a cooldown. The cooldown is
// 5 seconds after a send that saw something or after a quiet spell, and backs off while sends see nothing (5, 15, 30,
// 60 seconds) so a windy day cannot burn the SAM cap in minutes. The numbers live in one place.
import { COOLDOWN_MS, QUIET_RESET_MS } from "../src/cam/motion.js";
const still = new Uint8Array(100).fill(10), moved = new Uint8Array(100).fill(40);

test("the cadence numbers: 5, 15, 30, 60 seconds, two quiet minutes, 5 seconds to start", () => {
  expect(COOLDOWN_MS).toEqual([5_000, 15_000, 30_000, 60_000]);
  expect(QUIET_RESET_MS).toBe(120_000);
  expect(new MotionDetector().cooldownMs).toBe(5_000);
  expect(new MotionDetector({ cooldownMs: 0 }).cooldownMs).toBe(0);
});

test("sends that saw nothing back the cooldown off, 5 then 15, 30, 60 seconds; a sighting brings it back to 5", () => {
  const d = new MotionDetector({ consecutive: 1 });
  // A send fires at 500 under the first cooldown, 5 s.
  d.sample(still, 0);
  expect(d.sample(moved, 500)).toBe("motion");
  d.outcome(false);
  expect(d.cooldownMs).toBe(15_000);
  expect(d.sample(still, 5_400)).toBe("cooldown");
  expect(d.sample(moved, 5_600)).toBe("motion");
  d.outcome(false);
  expect(d.cooldownMs).toBe(30_000);
  expect(d.sample(still, 20_000)).toBe("cooldown");
  expect(d.sample(moved, 20_700)).toBe("motion");
  d.outcome(false);
  expect(d.cooldownMs).toBe(60_000);
  expect(d.sample(still, 50_000)).toBe("cooldown");
  expect(d.sample(moved, 50_800)).toBe("motion");
  d.outcome(false);
  expect(d.cooldownMs).toBe(60_000);
  expect(d.sample(still, 110_000)).toBe("cooldown");
  expect(d.sample(moved, 111_000)).toBe("motion");
  // The carrier: the cooldown in force drops to 5 s at once, and the next send gets 5 s too.
  d.outcome(true);
  expect(d.cooldownMs).toBe(5_000);
  expect(d.sample(still, 115_000)).toBe("cooldown");
  expect(d.sample(moved, 116_500)).toBe("motion");
});

test("two quiet minutes reset the cooldown to 5 seconds", () => {
  const d = new MotionDetector({ consecutive: 1 });
  d.sample(still, 0);
  expect(d.sample(moved, 500)).toBe("motion");
  d.outcome(false); d.outcome(false);
  expect(d.cooldownMs).toBe(30_000);
  expect(d.sample(still, 1_000)).toBe("cooldown");
  for (let t = 1_500; t < 120_000; t += 500) expect(d.sample(still, t)).toBe("idle");
  expect(d.cooldownMs).toBe(30_000);
  expect(d.sample(still, 121_000)).toBe("idle");
  expect(d.cooldownMs).toBe(5_000);
  expect(d.sample(moved, 121_500)).toBe("motion");
  expect(d.sample(still, 126_000)).toBe("cooldown");
  expect(d.sample(moved, 126_600)).toBe("motion");
});

test("a fixed cooldown still works for the envelope test's detector", () => {
  const d = new MotionDetector({ consecutive: 1, cooldownMs: 2_000 });
  d.sample(still, 0);
  expect(d.sample(moved, 500)).toBe("motion");
  d.outcome(false);
  expect(d.cooldownMs).toBe(2_000);
  expect(d.sample(still, 2_400)).toBe("cooldown");
  expect(d.sample(moved, 2_600)).toBe("motion");
});

// A live camera never gives two identical frames (sensor noise); a stream that stops changing for thirty seconds is frozen.
test("a stream that stops changing reads as frozen, and any change wakes it", () => {
  expect(FROZEN_SAMPLES).toBe(60);
  const m = new MotionDetector();
  const same = new Uint8Array(100).fill(10);
  for (let i = 0; i < 60; i++) m.sample(same, i * 500);
  expect(m.frozen()).toBe(false);
  m.sample(same, 60 * 500);
  expect(m.frozen()).toBe(true);
  m.sample(new Uint8Array(100).fill(11), 61 * 500);
  expect(m.frozen()).toBe(false);
  expect(m.frozen(1)).toBe(false);
  m.sample(new Uint8Array(100).fill(11), 62 * 500);
  expect(m.frozen(1)).toBe(true);
});

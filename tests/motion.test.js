import { expect, test } from "vitest";
import { MotionDetector, meanAbsDiff, toGray } from "../src/cam/motion.js";

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

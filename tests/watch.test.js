import { expect, test } from "vitest";
import { MotionDetector } from "../src/cam/motion.js";
import { applyGate, captureBurst, frameFields } from "../src/cam/watch.js";

// Every send carries the motion level that tripped the gate (the taps tune the gate from it); collect mode adds its flag.
test("frameFields carries the last motion level, and the collect flag only in collect mode", () => {
  const d = new MotionDetector({ consecutive: 1, cooldownMs: 0 });
  d.sample(new Uint8Array([0, 0]), 1);
  d.sample(new Uint8Array([30, 10]), 2);
  expect(frameFields(false, d)).toEqual({ level: "20.0" });
  expect(frameFields(true, d)).toEqual({ collect: "1", level: "20.0" });
  expect(frameFields(true, null)).toEqual({ collect: "1" });
  expect(frameFields(false, null)).toEqual({});
});

// The household's gate, learned from Ana's taps, raises or lowers the phone's motion threshold; nothing or nonsense means twelve.
test("applyGate sets the detector's threshold from the household's gate and falls back to twelve", () => {
  const d = new MotionDetector();
  expect(applyGate(d, 14)).toBe(14);
  expect(d.threshold).toBe(14);
  expect(applyGate(d, null)).toBe(12);
  expect(applyGate(d, "high")).toBe(12);
  expect(applyGate(d, 0)).toBe(12);
  expect(applyGate(d, 13.5)).toBe(13.5);
  expect(applyGate(null, 14)).toBe(14);
});

// A clip is a burst: n grabs, a gap between each, in order.
test("captureBurst grabs n frames gapMs apart", async () => {
  const at = [];
  const frames = await captureBurst(async () => { at.push(Date.now()); return at.length; }, 4, 20);
  expect(frames).toEqual([1, 2, 3, 4]);
  expect(at[3] - at[0]).toBeGreaterThanOrEqual(50);
  expect(await captureBurst(async () => "x", 1, 1000)).toEqual(["x"]);
});

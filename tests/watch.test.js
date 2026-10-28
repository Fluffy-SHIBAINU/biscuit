import { expect, test } from "vitest";
import { MotionDetector } from "../src/cam/motion.js";
import { frameFields } from "../src/cam/watch.js";

// Collect mode rides on the frames the phone already sends: a flag and the motion level that tripped the gate.
test("frameFields adds collect and the last motion level only in collect mode", () => {
  const d = new MotionDetector({ consecutive: 1, cooldownMs: 0 });
  d.sample(new Uint8Array([0, 0]), 1);
  d.sample(new Uint8Array([30, 10]), 2);
  expect(frameFields(false, d)).toEqual({});
  expect(frameFields(true, d)).toEqual({ collect: "1", level: "20.0" });
  expect(frameFields(true, null)).toEqual({ collect: "1" });
});

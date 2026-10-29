import { expect, test } from "vitest";
import { calibrate, type Sample } from "../scripts/cam/calibrate.js";

// Calibration from the founder's own labelled frames: which prompts see the mail, at what floor, and how high the motion gate can go.
const pos = (i: number, level: number, envelope: number, door: number): Sample => ({ id: i, at: "2026-10-28T15:00:00Z", test: false, level, seen: null, scores: { envelope, "mailbox door": door, "mail carrier": 0 }, label: i % 2 ? "mail" : "carrier" });
const neg = (i: number, level: number, envelope: number, door: number): Sample => ({ id: i, at: "2026-10-28T15:00:00Z", test: false, level, seen: null, scores: { envelope, "mailbox door": door, "mail carrier": 0 }, label: "nothing" });
const samples: Sample[] = [pos(1, 18, 0.8, 0.9), pos(2, 25, 0.7, 0.55), pos(3, 14, 0.6, 0.3), pos(4, 30, 0.2, 0.4), neg(5, 13, 0.1, 0.6), neg(6, 12.5, 0.45, 0.1), neg(7, 16, 0.2, 0.2), neg(8, 40, 0.3, 0.1)];

test("each prompt gets the lowest floor that keeps false alarms under one in ten, with its hit rate", () => {
  const r = calibrate(samples);
  expect(r.positives).toBe(4);
  expect(r.negatives).toBe(4);
  expect(r.prompts.envelope).toMatchObject({ floor: 0.5, hitRate: 0.75, falseRate: 0 });
  expect(r.prompts["mailbox door"]).toMatchObject({ floor: 0.65, hitRate: 0.25, falseRate: 0 });
  expect(r.prompts["mail carrier"]).toMatchObject({ hitRate: 0 });
});

test("the recommended set is the prompts that catch at least half the mail, scored together", () => {
  const r = calibrate(samples);
  expect(r.set.prompts).toEqual(["envelope"]);
  expect(r.set.hitRate).toBe(0.75);
  expect(r.set.falseRate).toBe(0);
  expect(r.current).toMatchObject({ prompts: ["mail carrier", "person", "mail truck", "envelope"], floor: 0.5 });
  expect(r.current.hitRate).toBe(0.75);
  expect(r.current.falseRate).toBe(0);
});

test("the motion gate rises to the level nine in ten mail events still clear, never below today's twelve", () => {
  const r = calibrate(samples);
  expect(r.motion).toEqual({ current: 12, suggested: 14, keptPositives: 1, droppedNegatives: 0.5 });
  const quiet = calibrate(samples.map((s) => ({ ...s, level: s.label === "nothing" ? 5 : 8 })));
  expect(quiet.motion.suggested).toBe(12);
});

test("unlabelled and test samples are left out, and an empty set reports nothing", () => {
  const r = calibrate([...samples, { ...pos(9, 50, 0.9, 0.9), label: null }, { ...neg(10, 50, 0.9, 0.9), test: true }]);
  expect(r.positives).toBe(4);
  expect(r.unlabelled).toBe(1);
  const empty = calibrate([]);
  expect(empty.positives).toBe(0);
  expect(empty.set.prompts).toEqual([]);
  expect(empty.motion.suggested).toBe(12);
  expect(typeof empty.markdown).toBe("string");
});

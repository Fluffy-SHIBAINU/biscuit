import { expect, test } from "vitest";
import { DEFAULT_FLOOR, DEFAULT_GATE, LABELS, TUNE_MIN_LABELS, tune, type TuneSample } from "../server/clips.js";

// Per-household learning from Ana's taps: the SAM score floor and the phone's motion gate, by the calibration script's
// rules, applied only from eight taps and never past what the taps can support.
const s = (label: string | null, level: number | null, envelope: number, door = 0, carrier = 0, test = false): TuneSample => ({ test, level, label, scores: { envelope, "mailbox door": door, "mail carrier": carrier } });
const EIGHT: TuneSample[] = [s("carrier", 18, 0.8), s("mail", 25, 0.7), s("carrier", 14, 0.6), s("carrier", 30, 0.55), s("nothing", 13, 0.1), s("other", 12.5, 0.45), s("nothing", 16, 0.2), s("nothing", 40, 0.3)];

test("below eight taps the defaults stay and the counts are still told", () => {
  const t = tune(EIGHT.slice(0, 7), new Date("2026-10-29T15:00:00Z"));
  expect(t).toEqual({ taps: 7, positives: 4, negatives: 3, floor: null, gate: null, caught: 4, falseAlarms: 0, at: "2026-10-29T15:00:00.000Z" });
  expect(TUNE_MIN_LABELS).toBe(8);
  expect(DEFAULT_FLOOR).toBe(0.5);
});

test("from eight taps the floor is the lowest with at most one false alarm in ten, and the gate the level nine deliveries in ten clear", () => {
  expect(tune(EIGHT)).toMatchObject({ taps: 8, positives: 4, negatives: 4, floor: 0.5, gate: 14, caught: 4, falseAlarms: 0 });
  const noisier = tune([s("carrier", 18, 0.8), s("carrier", 25, 0.7), s("carrier", 14, 0.65), s("carrier", 30, 0.9), s("nothing", 13, 0.55), s("nothing", 12.5, 0.6), s("nothing", 16, 0.2), s("nothing", 40, 0.1)]);
  expect(noisier).toMatchObject({ floor: 0.65, gate: 14, caught: 4, falseAlarms: 0 });
});

test("a floor that would lose more than half the deliveries is not applied, and the counts say what the defaults do", () => {
  const t = tune([s("carrier", 18, 0.3), s("carrier", 25, 0.35), s("carrier", 14, 0.4), s("carrier", 30, 0.9), s("nothing", 13, 0.5), s("nothing", 12.5, 0.55), s("nothing", 16, 0.6), s("nothing", 40, 0.7)]);
  expect(t.floor).toBeNull();
  expect(t.gate).toBe(14);
  // At the default floor only the 0.9 delivery shows; two of the four non-deliveries clear both the gate and the floor.
  expect(t.caught).toBe(1);
  expect(t.falseAlarms).toBe(2);
});

test("the floor needs three taps of each kind, the gate three deliveries, and the gate never drops below twelve", () => {
  const onlyMail = tune([s("carrier", 18, 0.8), s("carrier", 25, 0.7), s("carrier", 14, 0.6), s("carrier", 30, 0.55), s("carrier", 20, 0.8), s("carrier", 22, 0.7), s("carrier", 19, 0.6), s("nothing", 40, 0.3)]);
  expect(onlyMail.floor).toBeNull();
  expect(onlyMail.gate).toBe(14);
  const quiet = tune(EIGHT.map((x) => ({ ...x, level: x.label === "nothing" || x.label === "other" ? 5 : 8 })));
  expect(quiet.gate).toBe(DEFAULT_GATE);
  expect(DEFAULT_GATE).toBe(12);
  const tenth = tune([...Array.from({ length: 10 }, (_, i) => s("carrier", i === 0 ? 11 : 20 + i, 0.9)), s("nothing", 15, 0.1), s("nothing", 15, 0.1), s("nothing", 15, 0.1)]);
  expect(tenth.gate).toBe(21);
  expect(tenth.floor).toBe(0.3);
  // The delivery under the raised gate counts as missed.
  expect(tenth.caught).toBe(9);
  expect(tune([s("carrier", 13.26, 0.9), s("carrier", 14, 0.9), s("carrier", 15, 0.9), s("carrier", 16, 0.9), s("nothing", 15, 0.1), s("nothing", 15, 0.1), s("nothing", 15, 0.1), s("nothing", 15, 0.1)]).gate).toBe(13.3);
});

test("skipped, unlabelled and test-run samples are left out; mail and other count with their kind", () => {
  const extra: TuneSample[] = [s("skip", 50, 0.9), s(null, 50, 0.9), s("carrier", 50, 0.9, 0, 0, true)];
  expect(tune([...EIGHT, ...extra])).toMatchObject({ taps: 8, positives: 4, negatives: 4 });
  expect(LABELS).toEqual(["mail", "carrier", "nothing", "other", "skip"]);
  expect(tune([]).taps).toBe(0);
  expect(tune([]).floor).toBeNull();
});

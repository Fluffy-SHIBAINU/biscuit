import { expect, test } from "vitest";
import { DEFAULT_FLOOR, DEFAULT_GATE, LABELS, TUNE_MIN_LABELS, tune, type TuneSample } from "../server/clips.js";

// Per-household learning from Ana's taps: the SAM score floor and the phone's motion gate, by the calibration script's
// rules, applied only from eight taps and never past what the taps can support.
const s = (label: string | null, level: number | null, envelope: number, door = 0, carrier = 0, test = false): TuneSample => ({ test, level, label, scores: { envelope, "mailbox door": door, "mail carrier": carrier } });
const EIGHT: TuneSample[] = [s("carrier", 18, 0.8), s("mail", 25, 0.7), s("carrier", 14, 0.6), s("carrier", 30, 0.55), s("nothing", 13, 0.1), s("other", 12.5, 0.45), s("nothing", 16, 0.2), s("nothing", 40, 0.3)];

test("below eight taps the defaults stay and the counts are still told", () => {
  const t = tune(EIGHT.slice(0, 7), new Date("2026-10-29T15:00:00Z"));
  expect(t).toMatchObject({ taps: 7, positives: 4, negatives: 3, floor: null, gate: null, caught: 4, falseAlarms: 0, at: "2026-10-29T15:00:00.000Z" });
  expect(t.prompts).toBeDefined();
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

// Pre-classification and what the taps teach per prompt: a guess with a confidence on every clip, a mapping and a floor
// per prompt that follow Ana's taps, and the rule under which Biscuit classifies a clip itself.
import { AUTO_MIN_TAPS, autoClassifies, chimesOn, floorFor, guessLabel, NONE } from "../server/clips.js";

test("guessLabel: carrier prompts above the floor mean the carrier, a person alone means someone else, nothing above the floor means not mail; confidence grows with the margin and is never above 95 percent", () => {
  expect(guessLabel({ "mail carrier": 0.8, person: 0.6, "mail truck": 0, envelope: 0.1 }, null)).toEqual({ label: "carrier", confidence: 0.8, prompt: "mail carrier", version: 1 });
  expect(guessLabel({ "mail carrier": 0.2, person: 0.75, "mail truck": 0.1, envelope: 0 }, null)).toEqual({ label: "other", confidence: 0.75, prompt: "person", version: 1 });
  expect(guessLabel({ "mail carrier": 0.1, person: 0.1, "mail truck": 0, envelope: 0.3 }, null)).toEqual({ label: "nothing", confidence: 0.7, prompt: null, version: 1 });
  expect(guessLabel({}, null).confidence).toBe(0.95);
  expect(guessLabel({ envelope: 1 }, null).confidence).toBe(0.95);
  // The strongest carrier prompt carries the guess, whatever a person scored.
  expect(guessLabel({ "mail truck": 0.95, envelope: 0.6, person: 0.9 }, null)).toMatchObject({ label: "carrier", prompt: "mail truck", confidence: 0.95 });
});

test("the household's history shapes the guess: a per-prompt floor, a learned mapping, and lower confidence for a prompt Ana keeps correcting", () => {
  const tuning = { taps: 12, positives: 6, negatives: 6, floor: 0.5, gate: null, caught: 6, falseAlarms: 0, at: "", prompts: {
    person: { label: "carrier", learned: true, floor: null, fired: 5, agreed: 4, precision: 0.8 },
    "mail truck": { label: "carrier", learned: false, floor: 0.7, fired: 4, agreed: 1, precision: 0.25 },
  } } as any;
  // A person alone means the carrier at this box, with the confidence tempered by four taps in five agreeing.
  const g = guessLabel({ person: 0.9 }, tuning);
  expect(g).toMatchObject({ label: "carrier", prompt: "person" });
  expect(g.confidence).toBe(0.75);
  // The truck at 0.65 is under its raised floor of 0.70: nothing fired, and the guess says so, barely.
  const quiet = guessLabel({ "mail truck": 0.65 }, tuning);
  expect(quiet).toMatchObject({ label: "nothing", prompt: null });
  expect(quiet.confidence).toBe(0.54);
  // At 0.8 it fires, but one tap in four agreed, so the confidence is low.
  const weak = guessLabel({ "mail truck": 0.8 }, tuning);
  expect(weak).toMatchObject({ label: "carrier", prompt: "mail truck" });
  expect(weak.confidence).toBe(0.27);
});

test("floorFor and chimesOn: a prompt's own floor over the household's over the default; a mapping learned away from the carrier stops that prompt's chime", () => {
  expect(floorFor("person", null, 0.5)).toBe(0.5);
  const t = { prompts: { person: { label: "other", learned: true, floor: 0.8, fired: 3, agreed: 3, precision: 1 } } } as any;
  expect(floorFor("person", t, 0.6)).toBe(0.8);
  expect(floorFor("envelope", t, 0.6)).toBe(0.6);
  expect(chimesOn("person", t)).toBe(false);
  expect(chimesOn("person", null)).toBe(true);
  expect(chimesOn("mail carrier", t)).toBe(true);
  // The default mapping of a person to someone else is a guess, not a lesson: the chime still fires on it.
  expect(chimesOn("person", { prompts: { person: { label: "other", learned: false, floor: null, fired: 1, agreed: 0, precision: 0 } } } as any)).toBe(true);
});

test("per-prompt learning: precision and count, a mapping that follows the taps, a floor that rises for a prompt Ana keeps correcting, nothing below eight taps", () => {
  const g = (scores: Record<string, number>, label: string): TuneSample => ({ test: false, level: 20, scores, label, labelledBy: "ana", guess: guessLabel(scores, null) });
  const personCarrier = Array.from({ length: 4 }, () => g({ person: 0.8 }, "carrier"));
  const personOther = [g({ person: 0.8 }, "other")];
  const truckWrong = [g({ "mail truck": 0.6 }, "nothing"), g({ "mail truck": 0.65 }, "nothing"), g({ "mail truck": 0.9 }, "carrier")];
  const quiet = [g({}, "nothing"), g({}, "nothing")];
  const few = tune([...personCarrier, ...personOther]);
  expect(few.taps).toBe(5);
  expect(few.prompts!.person).toMatchObject({ label: "other", learned: false, floor: null, fired: 5, agreed: 1, precision: 0.2 });
  const t = tune([...personCarrier, ...personOther, ...truckWrong, ...quiet]);
  expect(t.taps).toBe(10);
  expect(t.prompts!.person).toMatchObject({ label: "carrier", learned: true, floor: null, fired: 5, agreed: 4, precision: 0.8 });
  expect(t.prompts!["mail truck"]).toMatchObject({ label: "carrier", learned: false, fired: 3, agreed: 1, floor: 0.65 });
  expect(t.prompts![NONE]).toMatchObject({ label: "nothing", learned: false, fired: 2, agreed: 2, precision: 1 });
  expect(t.prompts!.envelope).toMatchObject({ label: "carrier", learned: false, floor: null, fired: 0, agreed: 0, precision: null });
  expect(t.auto).toEqual({ classified: 0, corrected: 0 });
});

test("Biscuit's own classifications teach nothing; a Not right counts as a tap against the prompt; a tap after it is the final word", () => {
  const ana = (scores: Record<string, number>, label: string): TuneSample => ({ test: false, level: 20, scores, label, labelledBy: "ana", guess: guessLabel(scores, null) });
  const biscuit = (scores: Record<string, number>): TuneSample => { const guess = { ...guessLabel(scores, null), auto: true }; return { test: false, level: 20, scores, label: guess.label, labelledBy: "biscuit", guess }; };
  const rejected: TuneSample = { test: false, level: 20, scores: { envelope: 0.9 }, label: null, labelledBy: "ana", guess: { ...guessLabel({ envelope: 0.9 }, null), auto: true, rejected: true } };
  const t = tune([...Array.from({ length: 8 }, () => biscuit({ envelope: 0.9 })), ana({ envelope: 0.9 }, "carrier"), rejected]);
  expect(t.taps).toBe(2);
  expect(t.positives).toBe(1);
  expect(t.prompts!.envelope).toMatchObject({ fired: 2, agreed: 1, precision: 0.5 });
  expect(t.auto).toEqual({ classified: 9, corrected: 1 });
  const relabelled = tune([...Array.from({ length: 8 }, () => biscuit({ envelope: 0.9 })), ana({ envelope: 0.9 }, "carrier"), { ...rejected, label: "carrier" }]);
  expect(relabelled.prompts!.envelope).toMatchObject({ fired: 2, agreed: 2, precision: 1 });
  expect(relabelled.auto).toEqual({ classified: 9, corrected: 0 });
});

test("autoClassifies: twenty taps, a prompt right nine times in ten over ten or more, and a guess on that prompt at ninety percent or more", () => {
  const stat = { label: "carrier", learned: false, floor: null, fired: 10, agreed: 10, precision: 1 };
  const t = (taps: number, prompts: Record<string, unknown>) => ({ taps, positives: 0, negatives: 0, floor: null, gate: null, caught: 0, falseAlarms: 0, at: "", prompts }) as any;
  const sure = { label: "carrier", confidence: 0.92, prompt: "envelope", version: 1 } as const;
  expect(autoClassifies(sure, t(20, { envelope: stat }))).toBe(true);
  expect(autoClassifies(sure, t(19, { envelope: stat }))).toBe(false);
  expect(autoClassifies({ ...sure, confidence: 0.89 }, t(20, { envelope: stat }))).toBe(false);
  expect(autoClassifies(sure, t(20, { envelope: { ...stat, fired: 9, agreed: 9 } }))).toBe(false);
  expect(autoClassifies(sure, t(20, { envelope: { ...stat, agreed: 8, precision: 0.8 } }))).toBe(false);
  expect(autoClassifies(sure, t(20, { person: stat }))).toBe(false);
  expect(autoClassifies(sure, null)).toBe(false);
  // A quiet clip at a box whose quiet clips were always nothing.
  expect(autoClassifies({ label: "nothing", confidence: 0.95, prompt: null, version: 1 }, t(20, { [NONE]: { ...stat, label: "nothing" } }))).toBe(true);
  expect(AUTO_MIN_TAPS).toBe(20);
});

import { expect, test } from "vitest";
import { TAPS, TAP_WORDS, tuningLine } from "../src/lib/clips.js";

// The words on Ana's strip: the three taps, their stored labels, and the one line that says what her taps changed.
test("the three taps and their stored labels", () => {
  expect(TAPS.map((t) => [t.label, t.words])).toEqual([["carrier", "Mail carrier"], ["nothing", "Not mail"], ["other", "Someone else"]]);
  expect(TAP_WORDS.mail).toBe("Mail carrier");
  expect(TAP_WORDS.nothing).toBe("Not mail");
});

test("the result line says what the taps changed", () => {
  expect(tuningLine(null)).toBeNull();
  expect(tuningLine({ taps: 0 })).toBeNull();
  expect(tuningLine({ taps: 1, positives: 1, negatives: 0, floor: null, gate: null, caught: 1, falseAlarms: 0 })).toBe("From your 1 tap: Biscuit keeps its usual settings until you have tapped 8.");
  expect(tuningLine({ taps: 5, positives: 3, negatives: 2, floor: null, gate: null, caught: 3, falseAlarms: 1 })).toBe("From your 5 taps: Biscuit keeps its usual settings until you have tapped 8.");
  expect(tuningLine({ taps: 14, positives: 3, negatives: 11, floor: 0.62, gate: 12, caught: 3, falseAlarms: 1 })).toBe("From your 14 taps: the carrier shows at score 0.62 or more; 3 of 3 deliveries caught, 1 of 11 false alarms left.");
  expect(tuningLine({ taps: 9, positives: 7, negatives: 2, floor: null, gate: 15.5, caught: 7, falseAlarms: 0 })).toBe("From your 9 taps: the usual score floor of 0.50 stays until 3 deliveries and 3 non-deliveries are tapped; 7 of 7 deliveries caught, no false alarms; the phone now needs more movement before it looks (15.5, was 12).");
  expect(tuningLine({ taps: 8, positives: 8, negatives: 0, floor: null, gate: 12, caught: 8, falseAlarms: 0 })).toBe("From your 8 taps: the usual score floor of 0.50 stays until 3 deliveries and 3 non-deliveries are tapped; 8 of 8 deliveries caught.");
});

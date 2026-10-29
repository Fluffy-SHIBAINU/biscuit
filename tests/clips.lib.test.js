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

// The guess on a card, and the second line: what the taps taught per prompt and what Biscuit classified itself.
import { guessLine, learningLine, labelWords } from "../src/lib/clips.js";

test("the guess on a card", () => {
  expect(guessLine(null)).toBeNull();
  expect(guessLine({ label: "carrier", confidence: 0.8 })).toBe("Biscuit thinks: Mail carrier · 80%");
  expect(guessLine({ label: "nothing", confidence: 0.555 })).toBe("Biscuit thinks: Not mail · 56%");
  expect(labelWords("other")).toBe("Someone else");
  expect(labelWords("mail")).toBe("Mail carrier");
});

test("the second line says how the guesses did, what a prompt means here, which prompt needs more, and what Biscuit classified", () => {
  expect(learningLine(null)).toBeNull();
  expect(learningLine({ taps: 3 })).toBeNull();
  const stat = (o) => ({ label: "carrier", learned: false, floor: null, fired: 0, agreed: 0, precision: null, ...o });
  expect(learningLine({ taps: 20, prompts: { envelope: stat({ fired: 12, agreed: 11, precision: 11 / 12 }), none: stat({ label: "nothing", fired: 8, agreed: 6, precision: 0.75 }) } })).toBe("Biscuit's guess was right on 17 of 20 clips you checked.");
  expect(learningLine({ taps: 20, prompts: { person: stat({ label: "carrier", learned: true, fired: 5, agreed: 4, precision: 0.8 }), "mail truck": stat({ floor: 0.7, fired: 4, agreed: 1, precision: 0.25 }) }, auto: { classified: 12, corrected: 1 } })).toBe("Biscuit's guess was right on 5 of 9 clips you checked; “person” at this box means the carrier; “mail truck” is often wrong here and now needs a score of 0.70; Biscuit classified 12 clips itself, 1 of them corrected by you.");
  expect(learningLine({ taps: 9, prompts: { person: stat({ label: "nothing", learned: true, fired: 3, agreed: 3, precision: 1 }) }, auto: { classified: 1, corrected: 0 } })).toBe("Biscuit's guess was right on 3 of 3 clips you checked; “person” at this box means no mail; Biscuit classified 1 clip itself.");
  expect(learningLine({ taps: 9, prompts: { envelope: stat() } })).toBeNull();
});

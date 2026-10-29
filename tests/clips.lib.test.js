import { expect, test } from "vitest";
import { clipDetail, clipLine, clipsSummary, guessDetail, guessLine, labelPhrase, labelWords, learningLine, seenWords, TAPS, TAP_WORDS, tuningLine } from "../src/lib/clips.js";

// The words on Ana's "Who was at the box" card. The daughter's side is plain: the taps in her words, Biscuit's guess as a
// sentence, one or two lines that say how things stand. The numbers, floors and prompt names live in Details.
test("the three taps in her words, and their stored labels", () => {
  expect(TAPS.map((t) => [t.label, t.words])).toEqual([["carrier", "The mail carrier"], ["nothing", "A car or the wind"], ["other", "Someone else"]]);
  expect(TAP_WORDS.mail).toBe("The mail carrier");
  expect(TAP_WORDS.nothing).toBe("A car or the wind");
  expect(labelWords("other")).toBe("Someone else");
  expect(labelPhrase("carrier")).toBe("the mail carrier");
  expect(labelPhrase("mail")).toBe("the mail carrier");
  expect(labelPhrase("nothing")).toBe("a car or the wind");
  expect(labelPhrase("other")).toBe("someone else");
});

test("Biscuit's guess on a card is a sentence without a number; the number is in Details", () => {
  expect(guessLine(null)).toBeNull();
  expect(guessLine({ label: "carrier", confidence: 0.8 })).toBe("Biscuit thinks it was the mail carrier.");
  expect(guessLine({ label: "nothing", confidence: 0.555 })).toBe("Biscuit thinks it was a car or the wind.");
  expect(guessDetail(null)).toBeNull();
  expect(guessDetail({ label: "carrier", confidence: 0.8, prompt: "envelope", version: 1 })).toBe("Guess: carrier · 80% · rests on “envelope” · version 1");
  expect(guessDetail({ label: "nothing", confidence: 0.555, prompt: null, version: 1, auto: true, rejected: true })).toBe("Guess: nothing · 56% · nothing fired · version 1 · classified by Biscuit · said not right");
});

test("what SAM saw, in words", () => {
  expect(seenWords("mail carrier")).toBe("the mail carrier");
  expect(seenWords("person")).toBe("a person");
  expect(seenWords("mail truck")).toBe("the mail truck");
  expect(seenWords("envelope")).toBe("an envelope");
  expect(seenWords("mailbox door")).toBe("the mailbox door");
  expect(seenWords("package")).toBe("package");
});

test("the summary a daughter reads: one or two sentences from the state of the box", () => {
  const taught = { taps: 10, prompts: { envelope: { fired: 6, agreed: 5 }, none: { fired: 4, agreed: 3 } }, auto: { classified: 0, corrected: 0 } };
  expect(clipsSummary({ keepClips: false, movementsToday: 0, attention: 0, classified: 0, tuning: null })).toEqual({ title: "Who was at the box", lines: ["Clips are off. Turn them on below and Biscuit will keep a short clip of each movement for you to check."] });
  expect(clipsSummary({ keepClips: true, movementsToday: 0, attention: 0, classified: 0, tuning: null })).toEqual({ title: "Who was at the box", lines: ["Nothing has moved at the box today."] });
  expect(clipsSummary({ keepClips: true, movementsToday: 2, attention: 0, classified: 2, tuning: null })).toEqual({ title: "Who was at the box", lines: ["All of today's movements are sorted. Nothing to check."] });
  expect(clipsSummary({ keepClips: true, movementsToday: 3, attention: 3, classified: 0, tuning: null })).toEqual({ title: "Who was at the box", lines: ["3 clips to check. Who was it?"] });
  expect(clipsSummary({ keepClips: true, movementsToday: 1, attention: 1, classified: 0, tuning: null }).lines).toEqual(["1 clip to check. Who was it?"]);
  expect(clipsSummary({ keepClips: true, movementsToday: 4, attention: 2, classified: 8, tuning: taught }).lines).toEqual(["2 clips to check. Who was it?", "Good job! Biscuit is getting smarter: right 8 times out of 10."]);
  expect(clipsSummary({ keepClips: true, movementsToday: 4, attention: 0, classified: 8, tuning: taught }).lines).toEqual(["All of today's movements are sorted. Nothing to check.", "Good job! Biscuit is getting smarter: right 8 times out of 10."]);
  expect(clipsSummary({ keepClips: true, movementsToday: 4, attention: 1, classified: 30, tuning: { ...taught, auto: { classified: 5, corrected: 1 } } }).lines).toEqual(["1 clip to check. Who was it?", "Biscuit now sorts the sure ones by itself; you can still say Not right."]);
  expect(clipsSummary({ keepClips: true, movementsToday: 0, attention: 0, classified: 1, tuning: { taps: 1, prompts: { envelope: { fired: 1, agreed: 1 } }, auto: { classified: 0, corrected: 0 } } }).lines).toEqual(["Nothing has moved at the box today.", "Good job! Biscuit is getting smarter: right 1 time out of 1."]);
  // Clips kept before Ana turned them off still show, and the line says so.
  expect(clipsSummary({ keepClips: false, movementsToday: 0, attention: 2, classified: 0, tuning: null }).lines).toEqual(["2 clips to check. Who was it?"]);
});

test("the tuning line and the learning line keep their numbers, for Details", () => {
  expect(tuningLine({ taps: 14, positives: 3, negatives: 11, floor: 0.62, gate: 12, caught: 3, falseAlarms: 1 })).toBe("From your 14 taps: the carrier shows at score 0.62 or more; 3 of 3 deliveries caught, 1 of 11 false alarms left.");
  expect(tuningLine({ taps: 1, positives: 1, negatives: 0, floor: null, gate: null, caught: 1, falseAlarms: 0 })).toBe("From your 1 tap: Biscuit keeps its usual settings until you have tapped 8.");
  const stat = (o) => ({ label: "carrier", learned: false, floor: null, fired: 0, agreed: 0, precision: null, ...o });
  expect(learningLine({ taps: 20, prompts: { person: stat({ label: "carrier", learned: true, fired: 5, agreed: 4, precision: 0.8 }), "mail truck": stat({ floor: 0.7, fired: 4, agreed: 1, precision: 0.25 }) }, auto: { classified: 12, corrected: 1 } })).toBe("Biscuit's guess was right on 5 of 9 clips you checked; “person” at this box means the carrier; “mail truck” is often wrong here and now needs a score of 0.70; Biscuit classified 12 clips itself, 1 of them corrected by you.");
  expect(learningLine({ taps: 9, prompts: { envelope: stat() } })).toBeNull();
});

test("the line under a clip, in her words, and the same clip for Details", () => {
  expect(clipLine({ guess: { label: "carrier", confidence: 0.8 }, label: null }, "attention")).toBe("Biscuit thinks it was the mail carrier.");
  expect(clipLine({ guess: { label: "carrier", confidence: 0.8, rejected: true }, label: null }, "attention")).toBe("You said that wasn't right. What was it?");
  expect(clipLine({ guess: null, label: null, seen: "mail truck" }, "attention")).toBe("Something moved; Biscuit saw the mail truck. What was it?");
  expect(clipLine({ guess: null, label: null, seen: null }, "attention")).toBe("Something moved. What was it?");
  expect(clipLine({ label: "carrier", labelledBy: "biscuit" }, "classified")).toBe("The mail carrier. Biscuit sorted this one.");
  expect(clipLine({ label: "nothing", labelledBy: "ana" }, "classified")).toBe("A car or the wind. You said so.");
  expect(clipDetail({ id: 41, level: 17.5, seen: "envelope", scores: { "mail carrier": 0.12, envelope: 0.77 }, guess: { label: "carrier", confidence: 0.77, prompt: "envelope", version: 1 }, label: "carrier", labelledBy: "ana" })).toBe("Clip 41 · level 17.5 · SAM saw “envelope” · scores: mail carrier 0.12, envelope 0.77 · Guess: carrier · 77% · rests on “envelope” · version 1 · labelled by ana");
  expect(clipDetail({ id: 7, level: null, seen: null, scores: {}, guess: null, label: null, labelledBy: null })).toBe("Clip 7 · level unknown · SAM saw nothing it knows · no scores · no guess · unlabelled");
});

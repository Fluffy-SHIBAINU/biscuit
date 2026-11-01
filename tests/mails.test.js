import { expect, test } from "vitest";
import { groupByDay, mailChoices, mailsLine } from "../src/lib/mails.js";

const L = [
  { id: 1, sender: "Mass General", kind: "bill", status: "read", readAt: "2026-10-30T15:00:00Z" },
  { id: 2, sender: "Eversource", kind: "utility", status: "read", readAt: "2026-10-31T13:00:00Z" },
  { id: 3, sender: null, kind: "other", status: "not_mine", readAt: "2026-10-30T09:00:00Z" },
];

// My Mails: newest day first, each day's letters newest first.
test("groupByDay puts the newest day first and keeps each day's letters in order", () => {
  const g = groupByDay(L);
  expect(g.map((d) => d.letters.map((l) => l.id))).toEqual([[2], [1, 3]]);
  expect(g[0].day).toBe("2026-10-31");
  expect(typeof g[0].label).toBe("string");
});

// Voice opens or reads a letter by its number, its place or its sender; Biscuit says what there is and how to say it.
test("mailChoices hear open or read by number, ordinal or sender", () => {
  const ordered = groupByDay(L).flatMap((d) => d.letters);
  const opts = mailChoices(ordered);
  const pick = (t) => opts.find((o) => o.match(t))?.key;
  expect(pick("open the first one")).toBe("open:2");
  expect(pick("open number two")).toBe("open:1");
  expect(pick("read the third one to me")).toBe("read:3");
  expect(pick("open the one from Mass General")).toBe("open:1");
  expect(pick("read Eversource")).toBe("read:2");
  expect(pick("what's the weather")).toBeUndefined();
  expect(mailsLine(ordered)).toMatch(/^Three letters\. One: Eversource\. Two: Mass General\. Three: someone else's letter\. Say open one, or read one\.$/);
  expect(mailsLine([])).toBe("No mail read yet.");
});

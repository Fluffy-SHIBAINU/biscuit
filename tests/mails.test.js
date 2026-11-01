import { expect, test } from "vitest";
import { groupByDay, todayLine } from "../src/lib/mails.js";

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

// On landing Biscuit says one thing: how many came today.
test("todayLine counts today's mail in one short sentence", () => {
  const now = new Date("2026-10-31T20:00:00Z");
  expect(todayLine(L, now)).toBe("Today you got one mail.");
  expect(todayLine([...L, { id: 4, sender: "X", kind: "bill", status: "read", readAt: "2026-10-31T10:00:00Z" }], now)).toBe("Today you got two mails.");
  expect(todayLine(L, new Date("2026-11-02T20:00:00Z"))).toBe("No mail today.");
  expect(todayLine([], now)).toBe("No mail today.");
});

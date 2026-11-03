import { expect, test } from "vitest";
import { actionDays, monthGrid, monthLabel } from "../src/lib/calendar.js";

const L = [
  { id: 1, sender: "Mass General", kind: "bill", status: "read", amountCents: 123450, dueOn: "2026-11-20", readAt: "2026-11-02T15:00:00Z" },
  { id: 2, sender: "Eversource", kind: "utility", status: "handoff", amountCents: 8812, dueOn: "2026-11-20", readAt: "2026-11-01T15:00:00Z" },
  { id: 3, sender: "Old bill", kind: "bill", status: "tossed", amountCents: 100, dueOn: "2026-11-25", readAt: "2026-11-01T15:00:00Z" },
  { id: 4, sender: "No date", kind: "notice", status: "read", readAt: "2026-11-01T15:00:00Z" },
];

// A dot on a date means something is due that day: an unpaid bill's due date. Tossed letters and letters with no date get none.
test("actionDays lists what is due on each date, newest first", () => {
  const days = actionDays(L);
  expect(Object.keys(days)).toEqual(["2026-11-20"]);
  expect(days["2026-11-20"].map((a) => [a.id, a.what])).toEqual([[1, "due"], [2, "due"]]);
});

test("monthGrid lays November 2026 out in weeks starting Sunday", () => {
  const g = monthGrid(2026, 10);
  expect(g.length).toBe(5);
  expect(g[0][0]).toBe("2026-11-01");
  expect(g[4][6]).toBe("2026-12-05");
  expect(monthLabel(2026, 10)).toBe("November 2026");
});

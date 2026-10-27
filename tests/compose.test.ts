import { expect, test } from "vitest";
import { composeReading } from "../server/compose.js";
import { frameCheck } from "../server/frame.js";

const f = (field: string, value: string, quote: string, verified = true) => ({ field, value, quote, verified });

test("composeReading speaks verified facts in order", () => {
  const lines = composeReading(
    [f("sender", "Massachusetts General Hospital", "Massachusetts General Hospital"), f("amount_due", "$1,850.00", "Amount Due: $1,850.00"), f("due_date", "11/02/2026", "Due Date: 11/02/2026", false)],
    "bill",
  );
  expect(lines[0]).toBe("This is from Massachusetts General Hospital.");
  expect(lines[1]).toBe("It looks like a bill.");
  expect(lines.join(" ")).toContain("$1,850.00");
  expect(lines.join(" ")).not.toContain("11/02/2026");
});

test("composeReading prefers the hospital name over a department line", () => {
  const lines = composeReading([f("sender", "Patient Financial Services", "Patient Financial Services"), f("hospital_name", "Massachusetts General Hospital", "Massachusetts General Hospital")], "bill");
  expect(lines[0]).toBe("This is from Massachusetts General Hospital.");
});

test("composeReading says when the sender is unknown", () => {
  expect(composeReading([f("amount_due", "$84.00", "Amount Due $84.00")], "utility")[0]).toBe("I can't see who sent this.");
});

test("frameCheck names the cut edge", () => {
  expect(frameCheck([{ box: { x: 0.1, y: 0.1, w: 0.7, h: 0.9 }, score: 0.9 }])).toEqual({ ok: false, coverage: 0.63, cutEdge: "bottom" });
  expect(frameCheck([{ box: { x: 0.1, y: 0.1, w: 0.7, h: 0.7 }, score: 0.9 }]).ok).toBe(true);
  expect(frameCheck([{ box: { x: 0.3, y: 0.3, w: 0.3, h: 0.3 }, score: 0.9 }])).toEqual({ ok: false, coverage: 0.09, cutEdge: null });
  expect(frameCheck([])).toEqual({ ok: false, coverage: 0, cutEdge: null });
});

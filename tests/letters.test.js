import { expect, test } from "vitest";
import { cents, isoDate, summaryOf } from "../src/lib/letters.js";

test("isoDate and cents", () => {
  expect(isoDate("10/03/2026")).toBe("2026-10-03");
  expect(isoDate("Oct 3")).toBeNull();
  expect(cents("$1,850.00")).toBe(185000);
  expect(cents("84")).toBe(8400);
});

test("summaryOf keeps values and quotes, never the text", () => {
  const sum = summaryOf({ id: "x", readAt: "2026-10-26T15:49:00Z", kind: "bill", sender: "MGH", hospital: { ccn: "220071" }, transcription: "SECRET TEXT", facts: [{ field: "amount_due", value: "$1,850.00", quote: "Amount Due: $1,850.00", verified: true }, { field: "due_date", value: "11/02/2026", quote: "x", verified: false }] });
  expect(sum).toMatchObject({ hospitalCcn: "220071", amountCents: 185000, dueOn: null, quotes: [{ field: "amount_due", quote: "Amount Due: $1,850.00" }] });
  expect(JSON.stringify(sum)).not.toContain("SECRET");
});

import { spokenValue } from "../src/lib/letters.js";
test("spokenValue speaks only what the quote prints", () => {
  expect(spokenValue({ value: "2026-11-02", quote: "Due Date: 11/02/2026", verified: true })).toBeNull();
  expect(spokenValue({ value: "$1,850.00", quote: "Amount Due: $1,850.00", verified: true })).toBe("$1,850.00");
  expect(spokenValue({ value: "11/02/2026", quote: "Due Date: 11/02/2026", verified: false })).toBeNull();
});

// Read twice: a fact the two readers read two ways is never spoken, never summarised, and reaches Ana as a check.
import { statusLine } from "../src/lib/letters.js";
test("spokenValue is silent for a fact the gate did not clear", () => {
  expect(spokenValue({ value: "$1,850.00", quote: "Amount Due: $1,850.00", verified: true, spoken: false })).toBeNull();
  expect(spokenValue({ value: "$1,850.00", quote: "Amount Due: $1,850.00", verified: true, spoken: true })).toBe("$1,850.00");
});

test("summaryOf carries readBy and the checks, flags a review, and keeps a disputed amount out of the numbers", () => {
  const checks = [{ field: "amount_due", quotes: [{ reader: "meta", value: "$1,850.00", quote: "Amount Due: $1,850.00" }, { reader: "fireworks", value: "$1,350.00", quote: "Amount Due: $1,350.00" }] }];
  const sum = summaryOf({ id: "x", readAt: "2026-10-27T15:49:00Z", kind: "bill", sender: "MGH", readBy: "twice", checks, facts: [{ field: "amount_due", value: "$1,850.00", quote: "Amount Due: $1,850.00", verified: true, spoken: false, agreement: "differ" }, { field: "due_date", value: "11/02/2026", quote: "Due Date: 11/02/2026", verified: true, spoken: true, agreement: "agreed" }] });
  expect(sum).toMatchObject({ readBy: "twice", checks, needsReview: true, amountCents: null, dueOn: "2026-11-02" });
  expect(summaryOf({ id: "y", kind: "bill", sender: "MGH", facts: [] })).toMatchObject({ readBy: "single", checks: [], needsReview: false });
});

test("statusLine never says a disputed amount", () => {
  expect(statusLine({ status: "read", facts: [{ field: "amount_due", value: "$1,850.00", quote: "Amount Due: $1,850.00", verified: true, spoken: false }] })).toBe("Read.");
  expect(statusLine({ status: "handoff", facts: [{ field: "amount_due", value: "$1,850.00", quote: "Amount Due: $1,850.00", verified: true, spoken: true }] })).toMatch(/^\$1,850\.00\. Ana has the application/);
});

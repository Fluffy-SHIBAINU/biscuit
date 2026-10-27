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

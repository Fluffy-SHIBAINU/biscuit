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

import { composeOffer, unknownNumber } from "../server/compose.js";

test("composeOffer with a sheet", () => {
  const lines = composeOffer({ hospital: "Massachusetts General Hospital", freeCare: { maxFpl: "150", quote: "…", sourceUrl: null, checkedOn: null } } as any, {});
  expect(lines[0]).toBe("Massachusetts General Hospital gives free care to households at or below 150 percent of the federal poverty level.");
  expect(lines[1]).toBe("The hospital decides.");
  expect(lines.at(-1)).toBe("I can start the application with Ana. Shall I?");
});

test("composeOffer without a sheet", () => expect(composeOffer(null, {})).toEqual(["I can send this to Ana."]));

test("unknownNumber flags a number nobody publishes", () => {
  const sheet = { phone: "617-555-0100" } as any;
  expect(unknownNumber([f("phone_numbers", "617-555-0100", "call 617-555-0100")], sheet, "notice")).toBe(false);
  expect(unknownNumber([f("phone_numbers", "1-800-633-4227", "call 1-800-MEDICARE (1-800-633-4227)")], null, "notice")).toBe(false);
  expect(unknownNumber([f("phone_numbers", "888-555-0199", "call 888-555-0199 now")], sheet, "notice")).toBe(true);
  expect(unknownNumber([f("phone_numbers", "888-555-0199", "call 888-555-0199 now", false)], sheet, "notice")).toBe(false);
});

test("a date is spoken only in the form the quote prints", () => {
  expect(composeReading([f("due_date", "2026-11-02", "Due Date: 11/02/2026")], "bill").join(" ")).not.toContain("2026-11-02");
  expect(composeReading([f("due_date", "11/02/2026", "Due Date: 11/02/2026")], "bill").join(" ")).toContain("It is due 11/02/2026.");
});

test("an amount is spoken only as the quote's own money token with the same digits", () => {
  expect(composeReading([f("amount_due", "1850", "Statement 10/03/2026 Amount Due: $1,850.00")], "bill").join(" ")).toContain("The amount due is $1,850.00.");
  expect(composeReading([f("amount_due", "1850", "Previous balance $2,000.00 Amount Due: $1,850.00")], "bill").join(" ")).toContain("$1,850.00");
  expect(composeReading([f("amount_due", "1850", "Account 4471-55820")], "bill").join(" ")).not.toMatch(/amount due/);
});

test("unknownNumber flags only a notice that asks for a call", () => {
  expect(unknownNumber([f("phone_numbers", "888-555-0199", "Questions? 888-555-0199")], null, "utility")).toBe(false);
  expect(unknownNumber([f("phone_numbers", "888-555-0199", "call 888-555-0199 now")], null, "ad")).toBe(false);
  expect(unknownNumber([f("phone_numbers", "888-555-0199", "call 888-555-0199 now")], null, "notice")).toBe(true);
  expect(unknownNumber([f("phone_numbers", "888-555-0199", "Customer service 888-555-0199")], null, "notice")).toBe(false);
});

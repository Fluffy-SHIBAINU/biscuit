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

test("composeOffer without a sheet asks", () => expect(composeOffer(null, {})).toEqual(["Shall I send this to Ana?"]));

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

// From the simulated user trial: say whose name is on the letter first, and stop when it is not Rosa's.
import { sameName } from "../server/compose.js";

test("composeReading says whose name is on the letter before anything else", () => {
  const lines = composeReading([f("hospital_name", "Massachusetts General Hospital", "Massachusetts General Hospital"), f("addressee", "Rosa Alvarez", "Guarantor: Rosa Alvarez"), f("amount_due", "$1,850.00", "Amount Due: $1,850.00")], "bill");
  expect(lines[0]).toBe("This is addressed to Rosa Alvarez.");
  expect(lines[1]).toBe("This is from Massachusetts General Hospital.");
  expect(lines.join(" ")).toContain("$1,850.00");
});

test("a letter addressed to someone else is named and not read out", () => {
  const facts = [f("hospital_name", "Massachusetts General Hospital", "Massachusetts General Hospital"), f("addressee", "Mabel Thompson", "Patient: Mabel Thompson"), f("amount_due", "$1,850.00", "Amount Due: $1,850.00")];
  expect(composeReading(facts, "bill", { seniorName: "Rosa Alvarez" })).toEqual(["This is addressed to Mabel Thompson, not to you.", "I'll stop here and tell Ana."]);
  expect(composeReading(facts, "bill", { seniorName: "Mabel Thompson" })[0]).toBe("This is addressed to Mabel Thompson.");
  expect(sameName("Rosa Alvarez", "ROSA ALVAREZ")).toBe(true);
  expect(sameName("Mrs. Rosa Alvarez", "Rosa Alvarez")).toBe(true);
  expect(sameName("R. Alvarez", "Rosa Alvarez")).toBe(true);
  expect(sameName("Rosa", "Rosa Alvarez")).toBe(true);
  expect(sameName("Mabel Thompson", "Rosa Alvarez")).toBe(false);
  expect(sameName("Rosa Thompson", "Rosa Alvarez")).toBe(false);
});

test("a debt collector is named as the sender and the hospital as the account", () => {
  const lines = composeReading([f("sender", "Meridian Recovery Services", "Meridian Recovery Services"), f("hospital_name", "Linton Hospital", "Original creditor: Linton Hospital"), f("amount_due", "$104.58", "Amount Due: $104.58")], "bill");
  expect(lines[0]).toBe("This is from Meridian Recovery Services, about your Linton Hospital account.");
  const same = composeReading([f("sender", "Massachusetts General Hospital Patient Financial Services", "Patient Financial Services"), f("hospital_name", "Massachusetts General Hospital", "Massachusetts General Hospital")], "bill");
  expect(same[0]).toBe("This is from Massachusetts General Hospital.");
});

test("a page that says it is not a bill is spoken as a statement", () => {
  const facts = [f("hospital_name", "Western Reserve Hospital", "WESTERN RESERVE HOSPITAL"), f("statement_date", "07/27/2017", "07/27/2017")];
  const asBill = composeReading(facts, "bill", { notABill: true });
  expect(asBill[1]).toBe("It looks like a statement.");
  expect(asBill[2]).toBe("It says this is not a bill.");
  const asNotice = composeReading(facts, "notice", { notABill: true });
  expect(asNotice.slice(1, 3)).toEqual(["It looks like a notice.", "It says this is not a bill."]);
  expect(composeReading(facts, "bill")[1]).toBe("It looks like a bill.");
});

test("the hand-off is a question", () => {
  expect(composeOffer(null, {})).toEqual(["Shall I send this to Ana?"]);
});

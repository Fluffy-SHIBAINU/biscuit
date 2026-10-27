import { expect, test } from "vitest";
import { normalize, verifyFacts, verifyQuote } from "../server/verify.js";

const T = "Statement Date: 10/03/2026\nAmount Due:  $1,850.00\nSee “Financial Assistance” below — call us.";

test("verbatim quotes verify", () => expect(verifyQuote("Amount Due: $1,850.00", T)).toBe(true));
test("typography is normalised", () => expect(verifyQuote('See "Financial Assistance" below - call us.', T)).toBe(true));
test("a changed digit fails", () => expect(verifyQuote("Amount Due: $1,350.00", T)).toBe(false));
test("an empty quote never verifies", () => expect(verifyQuote("", T)).toBe(false));
test("normalize collapses space and straightens quotes", () => expect(normalize("a  “b”  —­c")).toBe('a "b" -c'));
test("verifyFacts marks the unverified one", () => {
  const facts = verifyFacts({ kind: "bill", amount_due: { value: "1850", quote: "Amount Due: 1850" }, statement_date: { value: "10/03/2026", quote: "Statement Date: 10/03/2026" } } as any, T);
  expect(facts.find((f) => f.field === "amount_due")?.verified).toBe(false);
  expect(facts.find((f) => f.field === "statement_date")?.verified).toBe(true);
  expect(facts.find((f) => f.field === "sender")).toBeUndefined();
});

import { expect, test } from "vitest";
import { agree, valuesAgree } from "../server/agree.js";
import type { Fact } from "../server/verify.js";

const f = (field: string, value: string, quote: string, verified = true): Fact => ({ field, value, quote, verified });
const META = { name: "meta", facts: [f("hospital_name", "Massachusetts General Hospital", "MASSACHUSETTS GENERAL HOSPITAL"), f("amount_due", "$1,850.00", "Amount Due: $1,850.00"), f("statement_date", "10/03/2026", "Statement Date: 10/03/2026"), f("due_date", "11/02/2026", "Due Date: 11/02/2026"), f("account_last4", "4421", "Account: ****4421", false)] };
const FW = { name: "fireworks", facts: [f("hospital_name", "MASSACHUSETTS GENERAL HOSPITAL", "MASSACHUSETTS GENERAL HOSPITAL"), f("amount_due", "1,850.00", "Amount Due $1,850.00"), f("statement_date", "10/08/2026", "Statement Date: 10/08/2026")] };

test("valuesAgree: digits for money, dates and phones; names ignoring case; hospitals by the same record", () => {
  expect(valuesAgree("amount_due", "$1,850.00", "1,850.00")).toBe(true);
  expect(valuesAgree("amount_due", "$1,850.00", "$1,850")).toBe(false);
  expect(valuesAgree("phone_numbers", "617-726-3884", "(617) 726-3884")).toBe(true);
  expect(valuesAgree("statement_date", "10/03/2026", "10/08/2026")).toBe(false);
  expect(valuesAgree("sender", "Massachusetts General Hospital", "MASSACHUSETTS  GENERAL HOSPITAL")).toBe(true);
  expect(valuesAgree("hospital_name", "Massachusetts General Hospital", "Mass General Hospital")).toBe(true);
  expect(valuesAgree("sender", "Medicare Rewards Department", "Medicare Department")).toBe(false);
});

test("single: no second reader, every verified fact is spoken, no agreement field", () => {
  const g = agree(META, null, "single");
  expect(g.readBy).toBe("single");
  expect(g.facts.map((x) => x.spoken)).toEqual([true, true, true, true, false]);
  expect(g.facts[0].agreement).toBeUndefined();
  expect(g.checks).toEqual([]);
  expect(g.differLine).toBeNull();
});

test("once: the second reader did not answer, the survivor's verified facts are spoken", () => {
  const g = agree(META, null, "paired");
  expect(g.readBy).toBe("once");
  expect(g.facts.map((x) => x.spoken)).toEqual([true, true, true, true, false]);
  expect(g.facts[0].agreement).toBe("once");
  expect(g.differLine).toBeNull();
});

test("twice: agreed is spoken, differ is not and carries the other quote, a fact one reader found is shown only", () => {
  const g = agree(META, FW, "paired");
  expect(g.readBy).toBe("twice");
  const by = Object.fromEntries(g.facts.map((x) => [x.field, x]));
  expect(by.hospital_name).toMatchObject({ agreement: "agreed", spoken: true });
  expect(by.amount_due).toMatchObject({ agreement: "agreed", spoken: true, quote: "Amount Due: $1,850.00" });
  expect(by.statement_date).toMatchObject({ agreement: "differ", spoken: false, other: { value: "10/08/2026", quote: "Statement Date: 10/08/2026" } });
  expect(by.due_date).toMatchObject({ agreement: "once", spoken: false });
  expect(by.account_last4.spoken).toBe(false);
  expect(by.account_last4.agreement).toBeUndefined();
  expect(g.checks).toEqual([{ field: "statement_date", quotes: [{ reader: "meta", value: "10/03/2026", quote: "Statement Date: 10/03/2026" }, { reader: "fireworks", value: "10/08/2026", quote: "Statement Date: 10/08/2026" }] }]);
  expect(g.differLine).toBe("The statement date I read two ways, so I won't say it. Ana will check.");
});

test("two facts read two ways make one line", () => {
  const g = agree({ name: "meta", facts: [f("amount_due", "$1,850.00", "Amount Due: $1,850.00"), f("statement_date", "10/03/2026", "Statement Date: 10/03/2026")] }, { name: "fireworks", facts: [f("amount_due", "$1,350.00", "Amount Due: $1,350.00"), f("statement_date", "10/08/2026", "Statement Date: 10/08/2026")] }, "paired");
  expect(g.differLine).toBe("The amount and the statement date I read two ways, so I won't say them. Ana will check.");
  expect(g.checks).toHaveLength(2);
});

test("valuesAgree: a sender that adds its department to the same name is the same sender", () => {
  expect(valuesAgree("sender", "Massachusetts General Hospital", "Massachusetts General Hospital Patient Financial Services")).toBe(true);
  expect(valuesAgree("sender", "Patient Financial Services", "Massachusetts General Hospital Patient Financial Services")).toBe(false);
  expect(valuesAgree("sender", "Medicare", "Medicare Rewards Department")).toBe(false);
  expect(valuesAgree("sender", "Medicare Rewards Department", "Medicare Rewards Departmental")).toBe(false);
});

test("the addressee is compared like a name", () => {
  expect(valuesAgree("addressee", "Rosa Alvarez", "ROSA ALVAREZ")).toBe(true);
  expect(valuesAgree("addressee", "Rosa Alvarez", "Mabel Thompson")).toBe(false);
});

import type { LetterKind } from "./questions.js";
import { normalize, verifyQuote } from "./verify.js";
import type { Fact } from "./verify.js";

const KIND_LINE: Record<LetterKind, string> = {
  bill: "It looks like a bill.",
  notice: "It looks like a notice.",
  utility: "It looks like a utility bill.",
  ad: "It looks like an advertisement.",
  other: "It looks like a letter.",
};

const MONEY = /\$?\d{1,3}(?:,\d{3})*(?:\.\d{2})?|\$?\d+(?:\.\d{2})?/g;

/** The digits Biscuit may say: the value as it appears in the quote, else the first money token in the quote. */
export function moneyFromQuote(quote: string, value: string): string | null {
  if (verifyQuote(value, quote)) return normalize(value);
  const m = normalize(quote).match(MONEY);
  return m ? m[0] : null;
}

/** Spoken lines from verified facts only, in the spec's order. A number never comes from outside a verified quote. */
export function composeReading(facts: Fact[], kind: LetterKind): string[] {
  const v = new Map<string, Fact>();
  for (const f of facts) if (f.verified && !v.has(f.field)) v.set(f.field, f);
  const lines: string[] = [];
  const from = v.get("hospital_name") ?? v.get("sender");
  lines.push(from ? `This is from ${normalize(from.value)}.` : "I can't see who sent this.");
  lines.push(KIND_LINE[kind] ?? KIND_LINE.other);
  const amount = v.get("amount_due");
  if (amount) {
    const money = moneyFromQuote(amount.quote, amount.value);
    if (money) lines.push(`The amount due is ${money}.`);
  }
  const statement = v.get("statement_date");
  if (statement) lines.push(`The statement date is ${normalize(statement.value)}.`);
  const due = v.get("due_date");
  if (due) lines.push(`It is due ${normalize(due.value)}.`);
  const fa = v.get("financial_assistance");
  if (fa && fa.value === "true") lines.push("It mentions financial assistance.");
  return lines;
}

import type { SheetSummary } from "./waive.js";

export const MEDICARE_NUMBER = "18006334227";
const digits = (s: string) => s.replace(/\D/g, "").replace(/^1(\d{10})$/, "$1");

/** True when a verified phone number on the letter matches neither the hospital's sheet phone nor Medicare's line. */
export function unknownNumber(facts: Fact[], sheet: SheetSummary | null): boolean {
  const known = new Set([digits(MEDICARE_NUMBER), ...(sheet?.phone ? [digits(sheet.phone)] : [])]);
  return facts.some((f) => f.field === "phone_numbers" && f.verified && digits(f.value).length >= 10 && !known.has(digits(f.value)));
}

/** The offer, spoken: the hospital's own rule with its number, then "The hospital decides.", then the question. No estimate is promised. */
export function composeOffer(sheet: SheetSummary | null, _answers: Record<string, string>): string[] {
  if (!sheet?.freeCare) return ["I can send this to Ana."];
  return [
    `${sheet.hospital} gives free care to households at or below ${sheet.freeCare.maxFpl} percent of the federal poverty level.`,
    "The hospital decides.",
    "I can start the application with Ana. Shall I?",
  ];
}

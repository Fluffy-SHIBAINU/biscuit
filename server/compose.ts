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

const MONEY = /\$?\d{1,3}(?:,\d{3})+(?:\.\d{2})?|\$?\d+(?:\.\d{2})?/g;
const digits = (s: string) => s.replace(/\D/g, "");

/** The digits Biscuit may say: the value exactly as the quote prints it, else the money token in the quote with the same digits (cents optional). */
export function moneyFromQuote(quote: string, value: string): string | null {
  if (verifyQuote(value, quote)) return normalize(value);
  const want = digits(value);
  if (!want) return null;
  for (const token of normalize(quote).match(MONEY) ?? []) {
    const have = digits(token);
    if (have === want || have === want + "00" || (want.endsWith("00") && have === want.slice(0, -2))) return token;
  }
  return null;
}

/** A date or any other value is spoken only in the form the quote prints it. */
export function printedForm(quote: string, value: string): string | null {
  return verifyQuote(value, quote) ? normalize(value) : null;
}

/** Spoken lines from verified facts only, in the spec's order. A number never comes from outside a verified quote. */
const TITLES = new Set(["mr", "mrs", "ms", "miss", "dr", "sr", "jr", "the"]);
const nameTokens = (s: string) => normalize(s).toLowerCase().replace(/[^a-z ]+/g, " ").split(" ").filter((t) => t && !TITLES.has(t));

/** The same person: one name's words are all in the other's (initials match a first letter), or the last names match with the same first letter. */
export function sameName(a: string, b: string): boolean {
  const ta = nameTokens(a), tb = nameTokens(b);
  if (!ta.length || !tb.length) return false;
  const [short, long] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  const fits = (t: string) => long.some((u) => u === t || (t.length === 1 && u.startsWith(t)));
  if (short.every(fits)) return true;
  return ta[ta.length - 1] === tb[tb.length - 1] && ta[0][0] === tb[0][0];
}

/** A sender that is another company writing about a hospital account, not one of the hospital's own departments. */
export function isCollector(sender: string): boolean {
  return /\b(recover\w*|collect\w*|receivables?|credit|bureau|agency|associates|portfolio|asset|account management|llc|inc\.?)\b/i.test(sender) && !/\b(patient|hospital|medical|health|clinic|billing department|business office)\b/i.test(sender);
}

export type ReadingOptions = { seniorName?: string | null; notABill?: boolean };

export function composeReading(facts: Fact[], kind: LetterKind, opts: ReadingOptions = {}): string[] {
  const v = new Map<string, Fact>();
  for (const f of facts) if (f.verified && !v.has(f.field)) v.set(f.field, f);
  const lines: string[] = [];
  const addressee = v.get("addressee");
  if (addressee && opts.seniorName && !sameName(addressee.value, opts.seniorName)) return [`This is addressed to ${normalize(addressee.value)}, not to you.`, "I'll stop here and tell Ana."];
  if (addressee) lines.push(`This is addressed to ${normalize(addressee.value)}.`);
  const hospital = v.get("hospital_name"), sender = v.get("sender");
  const from = hospital ?? sender;
  if (!from) lines.push("I can't see who sent this.");
  else if (hospital && sender && isCollector(sender.value) && !valuesAgree("sender", sender.value, hospital.value)) lines.push(`This is from ${normalize(sender.value)}, about your ${normalize(hospital.value)} account.`);
  else lines.push(`This is from ${normalize(from.value)}.`);
  lines.push(opts.notABill && kind === "bill" ? "It looks like a statement." : KIND_LINE[kind] ?? KIND_LINE.other);
  if (opts.notABill) lines.push("It says this is not a bill.");
  const amount = v.get("amount_due");
  if (amount) {
    const money = moneyFromQuote(amount.quote, amount.value);
    if (money) lines.push(`The amount due is ${money}.`);
  }
  const statement = v.get("statement_date");
  const statementText = statement && printedForm(statement.quote, statement.value);
  if (statementText) lines.push(`The statement date is ${statementText}.`);
  const due = v.get("due_date");
  const dueText = due && printedForm(due.quote, due.value);
  if (dueText) lines.push(`It is due ${dueText}.`);
  const fa = v.get("financial_assistance");
  if (fa && fa.value === "true") lines.push("It mentions financial assistance.");
  return lines;
}

import type { SheetSummary } from "./waive.js";
import { valuesAgree } from "./agree.js";

export const MEDICARE_NUMBER = "18006334227";
const phoneDigits = (s: string) => s.replace(/\D/g, "").replace(/^1(\d{10})$/, "$1");

/**
 * True for a notice (not a bill, utility or ad) that asks Rosa to call a verified number matching neither the hospital's
 * sheet phone nor Medicare's line. The quote must carry the ask ("call").
 */
export function unknownNumber(facts: Fact[], sheet: SheetSummary | null, kind: LetterKind): boolean {
  if (kind !== "notice" && kind !== "other") return false;
  const known = new Set([phoneDigits(MEDICARE_NUMBER), ...(sheet?.phone ? [phoneDigits(sheet.phone)] : [])]);
  return facts.some((f) => f.field === "phone_numbers" && f.verified && /\bcall\b/i.test(f.quote) && phoneDigits(f.value).length >= 10 && !known.has(phoneDigits(f.value)));
}

/** The offer, spoken: the hospital's own rule with its number, then "The hospital decides.", then the question. No estimate is promised. */
export function composeOffer(sheet: SheetSummary | null, _answers: Record<string, string>): string[] {
  if (!sheet?.freeCare) return ["Shall I send this to Ana?"];
  return [
    `${sheet.hospital} gives free care to households at or below ${sheet.freeCare.maxFpl} percent of the federal poverty level.`,
    "The hospital decides.",
    "I can start the application with Ana. Shall I?",
  ];
}

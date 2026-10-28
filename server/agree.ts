import { matchHospital } from "./hospitals.js";
import { normalize, type Fact } from "./verify.js";

export type Agreement = "agreed" | "differ" | "once";
export type ReadBy = "single" | "twice" | "once";
export type GatedFact = Fact & { agreement?: Agreement; spoken: boolean; other?: { value: string; quote: string } };
export type Check = { field: string; quotes: { reader: string; value: string; quote: string }[] };
export type Gate = { readBy: ReadBy; facts: GatedFact[]; checks: Check[]; differLine: string | null };
export type ReaderFacts = { name: string; facts: Fact[] };

const DIGIT_FIELDS = new Set(["amount_due", "statement_date", "due_date", "account_last4", "phone_numbers"]);
const NAME_FIELDS = new Set(["sender", "hospital_name"]);
const PHRASE: Record<string, string> = {
  amount_due: "the amount", statement_date: "the statement date", due_date: "the due date", sender: "the sender",
  hospital_name: "the hospital's name", account_last4: "the account number", phone_numbers: "a phone number", financial_assistance: "the help-paying line",
};
const digits = (s: string) => s.replace(/\D/g, "");
const flat = (s: string) => normalize(s).toLowerCase();

/** Two readings of one field agree: digits for money, dates, accounts and phones; names ignoring case, the same name with a department added, or the same hospital record; otherwise the normalised value. */
export function valuesAgree(field: string, a: string, b: string): boolean {
  if (DIGIT_FIELDS.has(field)) return digits(a).length > 0 && digits(a) === digits(b);
  if (flat(a) === flat(b)) return true;
  if (NAME_FIELDS.has(field)) {
    if (sameNameLonger(flat(a), flat(b))) return true;
    const ma = matchHospital(a), mb = matchHospital(b);
    return Boolean(ma && mb && ma.ccn === mb.ccn);
  }
  return false;
}

/** "Massachusetts General Hospital" and "Massachusetts General Hospital Patient Financial Services": one sender, the longer adds its department. Two words at least, on a word boundary. */
function sameNameLonger(a: string, b: string): boolean {
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  return short.split(" ").length >= 2 && long.startsWith(`${short} `);
}

function findMatch(field: string, value: string, facts: Fact[]): Fact | undefined {
  const same = facts.filter((f) => f.field === field && f.verified);
  if (field === "phone_numbers") return same.find((f) => digits(f.value) === digits(value));
  return same[0];
}

/**
 * The agreement gate. "single": no second reader is configured, so the primary's verified facts are spoken as before.
 * "paired" with no secondary: the primary is the survivor, read once, spoken as before. "paired" with both: only facts the
 * two readers read the same way are spoken; a fact read two ways is kept with the other reader's quote and listed for Ana.
 */
export function agree(primary: ReaderFacts, secondary: ReaderFacts | null, mode: "single" | "paired"): Gate {
  if (mode === "single") return { readBy: "single", facts: primary.facts.map((f) => ({ ...f, spoken: f.verified })), checks: [], differLine: null };
  if (!secondary) return { readBy: "once", facts: primary.facts.map((f) => ({ ...f, agreement: "once", spoken: f.verified })), checks: [], differLine: null };
  const checks: Check[] = [];
  const facts: GatedFact[] = primary.facts.map((f) => {
    if (!f.verified) return { ...f, spoken: false };
    const o = findMatch(f.field, f.value, secondary.facts);
    if (!o) return { ...f, agreement: "once", spoken: false };
    if (valuesAgree(f.field, f.value, o.value)) return { ...f, agreement: "agreed", spoken: true };
    checks.push({ field: f.field, quotes: [{ reader: primary.name, value: f.value, quote: f.quote }, { reader: secondary.name, value: o.value, quote: o.quote }] });
    return { ...f, agreement: "differ", spoken: false, other: { value: o.value, quote: o.quote } };
  });
  return { readBy: "twice", facts, checks, differLine: differLine(checks.map((c) => c.field)) };
}

/** "The statement date I read two ways, so I won't say it. Ana will check." */
export function differLine(fields: string[]): string | null {
  const phrases = [...new Set(fields.map((f) => PHRASE[f] ?? "one line"))];
  if (!phrases.length) return null;
  const list = phrases.length > 1 ? `${phrases.slice(0, -1).join(", ")} and ${phrases[phrases.length - 1]}` : phrases[0];
  return `${list[0].toUpperCase()}${list.slice(1)} I read two ways, so I won't say ${phrases.length > 1 ? "them" : "it"}. Ana will check.`;
}

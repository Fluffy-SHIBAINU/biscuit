import type { Extraction } from "./meta/spark.js";

export type Fact = { field: string; value: string; quote: string; verified: boolean };

/** NFKC, straight quotes and dashes, no soft hyphens, one space between words. Case is kept. */
export function normalize(s: string): string {
  return s
    .normalize("NFKC")
    .replace(/[‘’‚‛′]/g, "'")
    .replace(/[“”„‟″]/g, '"')
    .replace(/[‐-―−]/g, "-")
    .replace(/­/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** The §2 rule: a quote counts only as a verbatim substring of the transcription. */
export function verifyQuote(quote: string, transcription: string): boolean {
  const q = normalize(quote);
  return q.length > 0 && normalize(transcription).includes(q);
}

const CITED_FIELDS = ["sender", "hospital_name", "amount_due", "statement_date", "due_date", "account_last4"] as const;

export function verifyFacts(x: Extraction, transcription: string): Fact[] {
  const facts: Fact[] = [];
  const add = (field: string, value: string, quote: string) => facts.push({ field, value, quote, verified: verifyQuote(quote, transcription) });
  for (const field of CITED_FIELDS) {
    const c = x[field];
    if (c && c.value) add(field, c.value, c.quote);
  }
  if (x.financial_assistance) add("financial_assistance", String(x.financial_assistance.value), x.financial_assistance.quote);
  for (const p of x.phone_numbers ?? []) if (p.value) add("phone_numbers", p.value, p.quote);
  return facts;
}

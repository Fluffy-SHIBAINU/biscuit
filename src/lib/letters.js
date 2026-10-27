// Letter helpers shared by the Rosa screens: summaries for the server, dates and amounts from verified quotes.

export function isoDate(us) {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec((us || "").trim());
  if (!m) return null;
  return `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
}

export function cents(money) {
  const m = /(\d{1,3}(?:,\d{3})*|\d+)(?:\.(\d{2}))?/.exec(money || "");
  if (!m) return null;
  return Number(m[1].replace(/,/g, "")) * 100 + (m[2] ? Number(m[2]) : 0);
}

const verified = (facts, field) => facts.find((f) => f.field === field && f.verified)?.value ?? null;
const norm = (s) => (s || "").normalize("NFKC").replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"').replace(/[\u2010-\u2015\u2212]/g, "-").replace(/\s+/g, " ").trim();

/** What Biscuit may say for a fact: the value only when the quote prints it in that exact form. */
export function spokenValue(fact) {
  if (!fact || !fact.verified) return null;
  return norm(fact.quote).includes(norm(fact.value)) ? norm(fact.value) : null;
}

/** What the server may keep: no text, only the verified values and their quotes. */
export function summaryOf(entry) {
  const facts = entry.facts || [];
  return {
    id: entry.id,
    readAt: entry.readAt,
    kind: entry.kind,
    sender: entry.sender,
    hospitalCcn: entry.hospital?.ccn ?? null,
    amountCents: cents(verified(facts, "amount_due")),
    statementOn: isoDate(verified(facts, "statement_date")),
    dueOn: isoDate(verified(facts, "due_date")),
    quotes: facts.filter((f) => f.verified).map((f) => ({ field: f.field, quote: f.quote })),
    status: entry.status || "read",
    needsReview: Boolean(entry.needsReview),
  };
}

export function statusLine(l) {
  const money = spokenValue(l.facts?.find((f) => f.field === "amount_due"));
  const due = spokenValue(l.facts?.find((f) => f.field === "due_date"));
  switch (l.status) {
    case "handoff": return `${money ? money + ". " : ""}Ana has the application. Waiting on her, then the hospital.`;
    case "waiting_hospital": return `${money ? money + ". " : ""}Waiting on the hospital's answer.`;
    case "tossed": return "Tossed.";
    case "unknown_number": return "Asks you to call a number nobody publishes. Sent to Ana.";
    default: return [money, due ? `due ${due}` : null].filter(Boolean).join(", ") || "Read.";
  }
}

// Letter helpers shared by the Rosa screens: summaries for the server, dates and amounts from verified quotes.

/** How each reader is named on screen. */
export const READER_NAME = { meta: "Meta's reader", fireworks: "Fireworks reader" };
/** A reader's printed name: its label (the model), else the name Biscuit knows, else the id. Takes a reader object or a name. */
export const readerName = (r) => (r && typeof r === "object" ? r.label || READER_NAME[r.name] || r.name : READER_NAME[r] || r);

/** Why a letter was read once: which reader was away, and who read it alone. */
export function readOnceLine(readers) {
  const away = (readers || []).find((r) => r.status !== "ok");
  const alone = (readers || []).find((r) => r.status === "ok");
  if (!away || !alone) return "One reader read it alone. Ana's page says so.";
  const why = away.status === "timeout" ? "didn't answer in 10 seconds" : away.status === "unreadable" ? "couldn't make out the page" : "had an error";
  return `${readerName(away)} ${why}. ${readerName(alone)} read it alone. Ana's page says so.`;
}

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

// A fact counts for a number only when its quote was verified and the agreement gate cleared it (`spoken`, absent on older entries).
const clear = (f) => f.verified && f.spoken !== false;
const verified = (facts, field) => facts.find((f) => f.field === field && clear(f))?.value ?? null;
const norm = (s) => (s || "").normalize("NFKC").replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"').replace(/[\u2010-\u2015\u2212]/g, "-").replace(/\s+/g, " ").trim();

/** What Biscuit may say for a fact: the value only when the quote prints it in that exact form. */
export function spokenValue(fact) {
  if (!fact || !clear(fact)) return null;
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
    readBy: entry.readBy || "single",
    checks: Array.isArray(entry.checks) ? entry.checks : [],
    needsReview: Boolean(entry.needsReview) || (Array.isArray(entry.checks) && entry.checks.length > 0),
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

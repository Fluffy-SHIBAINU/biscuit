// Ana's calendar: a dot on a date that needs something done, today an unpaid bill's due date.
const key = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const UNPAID = new Set(["read", "handoff", "waiting_hospital", "unknown_number"]);

/** { "YYYY-MM-DD": [{ id, sender, amountCents, what: "due" }] } for every letter still open with a due date. */
export function actionDays(letters) {
  const out = {};
  for (const l of letters) {
    if (!l.dueOn || !UNPAID.has(l.status)) continue;
    const day = String(l.dueOn).slice(0, 10);
    (out[day] ||= []).push({ id: l.id, sender: l.sender || "Unknown sender", amountCents: l.amountCents ?? null, what: "due" });
  }
  return out;
}

/** The weeks of a month (Sunday first) as "YYYY-MM-DD" strings, padded with the neighbouring days. month is 0-based. */
export function monthGrid(year, month) {
  const first = new Date(year, month, 1);
  const start = new Date(year, month, 1 - first.getDay());
  const weeks = [];
  const d = new Date(start);
  do {
    const week = [];
    for (let i = 0; i < 7; i++) { week.push(key(d)); d.setDate(d.getDate() + 1); }
    weeks.push(week);
  } while (d.getMonth() === month);
  return weeks;
}

export const monthLabel = (year, month) => new Date(year, month, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
export const todayKey = (now = new Date()) => key(now);

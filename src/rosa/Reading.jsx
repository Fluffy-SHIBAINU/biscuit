import React, { useEffect, useRef, useState } from "react";
import Dog from "../components/Dog.jsx";
import { patchLetter, postLetter } from "../lib/api.js";
import { cents, isoDate, summaryOf } from "../lib/letters.js";
import { navigate } from "../lib/navigate.js";
import { speakAndKeep, stopSpeaking } from "../lib/speech.js";
import { releaseEar } from "../lib/ear.js";
import { askChoices, cancelChoices } from "../lib/hear.js";
import { saidMine } from "../lib/talk.js";
import { store, useStore } from "../lib/store.js";

export const FIELD_LABEL = { addressee: "Addressed To", sender: "From", hospital_name: "Hospital", amount_due: "Amount Due", statement_date: "Statement Date", due_date: "Due Date", financial_assistance: "Financial Assistance", phone_numbers: "Phone Number", account_last4: "Account" };

/** What the letter row on the server takes from an edited field, when it takes anything. */
export function editFor(field, value) {
  if (field === "sender") return value.trim() ? { sender: value.trim() } : null;
  if (field === "amount_due") { const c = cents(value); return c === null ? null : { amountCents: c }; }
  if (field === "due_date") { const d = isoDate(value); return d ? { dueOn: d } : null; }
  if (field === "statement_date") { const d = isoDate(value); return d ? { statementOn: d } : null; }
  return null;
}

/** One field of the letter: its name, its value in a box Rosa can correct, the line it came from underneath. */
export function Fact({ f, onEdit }) {
  const [draft, setDraft] = useState(f.value ?? "");
  useEffect(() => { setDraft(f.value ?? ""); }, [f.value]);
  const commit = () => { if (draft.trim() !== (f.value ?? "")) onEdit(draft.trim()); };
  return (
    <div className="fact">
      <span className="label plain">{FIELD_LABEL[f.field] || f.field}</span>
      <input className="field" value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} aria-label={FIELD_LABEL[f.field] || f.field} />
      {f.quote && <span className="quote"><span className="mark">“{f.quote}”</span></span>}
    </div>
  );
}

/** Whose name is on it, from the reading; else the one this phone belongs to. */
export function addressedTo(r, called) {
  const a = (r?.facts || []).find((f) => f.field === "addressee" && f.value);
  return a ? a.value : called;
}

export default function Reading() {
  const s = useStore();
  const r = s.lastReading;
  const alive = useRef(true);
  const name = s.household?.called || "Rosa";
  const title = `This is addressed to ${addressedTo(r, name)}.`;

  /** Rosa overrules "not to you": the letter becomes hers, and the full summary goes to Ana's page. */
  function claimAsMine() {
    if (!r?.mine) return;
    stopSpeaking();
    const entry = { ...r, mismatch: false, status: "read", needsReview: false, lines: r.mine.lines, offerLines: r.mine.offerLines };
    store.set((st) => ({ docket: st.docket.map((l) => (l.id === r.id ? { ...l, ...entry } : l)), lastReading: entry }));
    if (store.get().household?.shareLetters !== false) postLetter(summaryOf(entry)).catch(() => {});
  }

  /** A corrected field: this phone keeps her words as the value (spoken from now on), and the server row takes what it can. */
  function edit(field, value) {
    const facts = (r.facts || []).map((f) => (f.field === field ? { ...f, value, verified: true, spoken: true, edited: true } : f));
    const entry = { ...r, facts, sender: field === "sender" ? value : r.sender };
    store.set((st) => ({ docket: st.docket.map((l) => (l.id === r.id ? { ...l, ...entry } : l)), lastReading: entry }));
    const edits = editFor(field, value);
    if (edits && !r.mismatch) patchLetter(r.id, { edits }).catch(() => {});
  }

  /** On "not to you": Rosa can say it's mine. */
  async function askIfMine() {
    if (!alive.current) return;
    const key = await askChoices({ lines: [], alive: () => alive.current, options: [
      { key: "mine", say: "it's mine", match: (t) => saidMine(t) },
      { key: "notMine", say: "not mine", match: (t) => /\b(not mine|no|someone else|not me)\b/i.test(t) },
    ] });
    if (!alive.current) return;
    if (key === "mine") claimAsMine();
    else if (key === "notMine") navigate("/docket");
  }

  useEffect(() => {
    alive.current = true;
    (async () => {
      if (!r) return;
      await speakAndKeep([title]);
      if (!alive.current) return;
      if (r.mismatch) await askIfMine();
    })();
    return () => { alive.current = false; stopSpeaking(); cancelChoices(); releaseEar(); };
  }, [r?.id, r?.mismatch]);

  if (!r) { navigate("/"); return null; }
  const facts = (r.facts || []).filter((f) => f.field !== "addressee");
  // Read two ways: the value shown is the primary reader's, the more confident of the two.
  return (
    <main className="screen">
      <div className="row between"><span className="label">Biscuit Reads It</span><a href="/" className="link" onClick={(e) => { e.preventDefault(); cancelChoices(); stopSpeaking(); navigate("/"); }}>Home</a></div>
      <div className="row"><Dog size={56} /><h1 className="display small">{title}</h1></div>
      {!r.mismatch && facts.length > 0 && (
        <section className="card facts">
          <span className="label">The Letter Says:</span>
          {facts.map((f) => <Fact key={f.field} f={f} onEdit={(v) => edit(f.field, v)} />)}
        </section>
      )}
      <div className="spacer" />
      {r.mismatch && r.mine && <button type="button" className="btn big" onClick={() => { cancelChoices(); claimAsMine(); }}>It's Mine, Read It</button>}
      <button type="button" className={`btn ${r.mismatch ? "secondary" : "big"}`} onClick={() => { cancelChoices(); stopSpeaking(); navigate(r.mismatch ? "/docket" : "/question"); }}>{r.mismatch ? "All Right" : "Next"}</button>
    </main>
  );
}

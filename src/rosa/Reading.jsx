import React, { useEffect, useRef, useState } from "react";
import Dog from "../components/Dog.jsx";
import { patchLetter, postLetter } from "../lib/api.js";
import { cents, isoDate, summaryOf } from "../lib/letters.js";
import { navigate } from "../lib/navigate.js";
import { speakAndKeep, stopSpeaking } from "../lib/speech.js";
import { releaseEar } from "../lib/ear.js";
import { askChoices, cancelChoices } from "../lib/hear.js";
import { saidMine } from "../lib/talk.js";
import { sameName } from "../lib/names.js";
import { speak } from "../lib/speech.js";
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
const FORMAT = { amount_due: ["decimal", "Like 1,234.50"], due_date: ["numeric", "Like 11/20/2026"], statement_date: ["numeric", "Like 11/2/2026"], phone_numbers: ["tel", null], account_last4: ["numeric", null] };
export function Fact({ f, onEdit, extra = null }) {
  const [draft, setDraft] = useState(f.value ?? "");
  const [hint, setHint] = useState("");
  const [kept, setKept] = useState(false);
  useEffect(() => { setDraft(f.value ?? ""); }, [f.value]);
  useEffect(() => { if (!kept) return; const k = setTimeout(() => setKept(false), 1200); return () => clearTimeout(k); }, [kept]);
  const [mode, example] = FORMAT[f.field] || ["text", null];
  // A date or an amount the server cannot take is said so, under the box, instead of failing quietly. A kept value gets a
  // green ring for a moment and a Kept mark for good.
  const commit = () => {
    const v = draft.trim();
    if (v === (f.value ?? "")) return;
    if (example && editFor(f.field, v) === null) { setHint(example); return; }
    setHint(""); setKept(true); onEdit(v);
  };
  return (
    <div className="fact">
      <span className="row fact-head"><span className="label plain">{FIELD_LABEL[f.field] || f.field}</span>{f.edited && <span className="pill ok kept-pill">Kept</span>}</span>
      <input className={`field ${kept ? "kept" : ""} ${hint ? "wrong" : ""}`} value={draft} inputMode={mode} onChange={(e) => { setDraft(e.target.value); if (hint) setHint(""); }} onBlur={commit} onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} aria-label={FIELD_LABEL[f.field] || f.field} />
      {hint && <span className="lead small bad">{hint}</span>}
      {f.quote && <span className="quote"><span className="mark">“{f.quote}”</span></span>}
      {extra}
    </div>
  );
}

/** Whose name is on it, from the reading; else the one this phone belongs to. */
export function addressedTo(r, called) {
  const a = (r?.facts || []).find((f) => f.field === "addressee" && f.value);
  return a ? a.value : called;
}

const KIND_WORD = { bill: "a bill", notice: "a notice", utility: "a utility bill", ad: "an ad", other: "a letter" };
/** The title and the one spoken line: what it is; and, on a letter for someone else, for whom. */
export function titleOf(r, called) {
  const what = KIND_WORD[r?.kind] || "a letter";
  return r?.mismatch ? `This is ${what} for ${addressedTo(r, called)}, not you.` : `This is ${what}.`;
}

export default function Reading() {
  const s = useStore();
  const r = s.lastReading;
  const alive = useRef(true);
  const name = s.household?.called || "Rosa";
  const title = titleOf(r, name);

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
    const have = (r.facts || []).some((f) => f.field === field);
    const facts = have ? (r.facts || []).map((f) => (f.field === field ? { ...f, value, verified: true, spoken: true, edited: true } : f)) : [{ field, value, quote: "", verified: true, spoken: true, edited: true }, ...(r.facts || [])];
    let entry = { ...r, facts, sender: field === "sender" ? value : r.sender };
    // The name on it changed: is it hers? Hers makes the letter hers (read in full, shared with Ana); another's makes it someone else's.
    if (field === "addressee") {
      const mine = sameName(value, name);
      if (mine && r.mismatch) entry = { ...entry, mismatch: false, status: "read", needsReview: false, lines: r.mine?.lines || r.lines, offerLines: r.mine?.offerLines || r.offerLines };
      if (!mine && !r.mismatch) entry = { ...entry, mismatch: true, status: "not_mine", needsReview: true, mine: r.mine || { lines: r.lines, offerLines: r.offerLines } };
    }
    store.set((st) => ({ docket: st.docket.map((l) => (l.id === r.id ? { ...l, ...entry } : l)), lastReading: entry }));
    if (field === "addressee" && entry.mismatch !== r.mismatch) {
      cancelChoices(); stopSpeaking();
      if (store.get().household?.shareLetters !== false) postLetter(summaryOf(entry)).catch(() => {});
      speak([entry.mismatch ? `Not yours, then. ${titleOf(entry, name)}` : "Yours, then. I'll read it."]);
      return;
    }
    const edits = editFor(field, value);
    if (edits && !entry.mismatch) patchLetter(r.id, { edits }).catch(() => {});
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

  useEffect(() => { if (!r) navigate("/"); }, [r]);
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

  if (!r) return null;
  // Addressed To is a field like the others, and can be corrected; when the reading found no name, the phone's own goes in.
  const facts = (r.facts || []).some((f) => f.field === "addressee") ? r.facts : [{ field: "addressee", value: name, quote: "" }, ...(r.facts || [])];
  // Read two ways: the value shown is the primary reader's, the more confident of the two.
  return (
    <main className="screen">
      <div className="row between"><span className="label">Biscuit Reads It</span><a href="/" className="link" onClick={(e) => { e.preventDefault(); cancelChoices(); stopSpeaking(); navigate("/"); }}>Home</a></div>
      <div className="row"><Dog size={56} /><h1 className="display small">{title}</h1></div>
      {facts.length > 0 && (
        <section className="card facts" style={{ viewTransitionName: "letter" }}>
          <span className="label">The Letter Says:</span>
          {facts.map((f) => <Fact key={f.field} f={f} onEdit={(v) => edit(f.field, v)} extra={f.field === "addressee" && !sameName(f.value, name) ? <button type="button" className="btn secondary small" onClick={() => edit("addressee", name)}>This Is Addressed to Me</button> : null} />)}
        </section>
      )}
      <div className="spacer" />
      {r.mismatch && r.mine && <button type="button" className="btn big" onClick={() => { cancelChoices(); claimAsMine(); }}>It's Mine, Read It</button>}
      <button type="button" className={`btn ${r.mismatch ? "secondary" : "big sticky"}`} onClick={() => { cancelChoices(); stopSpeaking(); navigate(r.mismatch ? "/docket" : "/question"); }}>{r.mismatch ? "All Right" : "Next"}</button>
    </main>
  );
}

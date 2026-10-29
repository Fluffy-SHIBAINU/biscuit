import React, { useEffect } from "react";
import Dog from "../components/Dog.jsx";
import { readOnceLine } from "../lib/letters.js";
import { navigate } from "../lib/navigate.js";
import { speakAndKeep, stopSpeaking } from "../lib/speech.js";
import { useStore } from "../lib/store.js";

export const FIELD_LABEL = { sender: "From", hospital_name: "Hospital", amount_due: "Amount due", statement_date: "Statement date", due_date: "Due date", financial_assistance: "Financial assistance", phone_numbers: "Phone number", account_last4: "Account" };
const READ_PILL = { twice: ["ok", "Read twice ✓"], once: ["warn", "Read once"] };

/** One fact row: the value over its quote, and what the two readers made of it. */
export function Fact({ f, readBy }) {
  const label = FIELD_LABEL[f.field] || f.field;
  if (!f.verified) return <div className="fact unverified"><span className="label plain">{label}</span><strong>{f.value}</strong><span className="label plain">unverified, not spoken</span></div>;
  if (f.agreement === "differ") {
    return (
      <div className="fact differ">
        <span className="label plain">{label}</span>
        <strong>Not said aloud</strong>
        <span className="row wrap"><span className="pill warn">Differ</span><span className="seen">Read two ways: <span className="quote"><span className="mark">“{f.quote}”</span></span> and <span className="quote"><span className="mark">“{f.other?.quote}”</span></span>. Ana will check.</span></span>
      </div>
    );
  }
  return (
    <div className="fact">
      <span className="label plain">{label}</span>
      <strong>{f.value}</strong>
      <span className="quote"><span className="mark">“{f.quote}”</span></span>
      {f.agreement === "agreed" && <span className="agree">Both readers: the same line</span>}
      {f.agreement === "once" && readBy === "twice" && <span className="seen">One reader saw this · not said</span>}
    </div>
  );
}

export default function Reading() {
  const s = useStore();
  const r = s.lastReading;
  useEffect(() => {
    if (r?.lines?.length) speakAndKeep(r.lines);
    return () => stopSpeaking();
  }, [r?.id]);
  if (!r) { navigate("/"); return null; }
  const pill = READ_PILL[r.readBy];
  return (
    <main className="screen">
      <div className="row between"><span className="row"><span className="label">Biscuit reads it</span>{pill && <span className={`pill ${pill[0]}`}>{pill[1]}</span>}</span><a href="/" className="link" onClick={(e) => { e.preventDefault(); stopSpeaking(); navigate("/"); }}>Stop</a></div>
      <div className="row"><Dog size={56} /><h1 className="display small">{r.lines?.[0] || "Here's what it says."}</h1></div>
      {r.readBy === "once" && (
        <section className="card">
          <span className="label">Why read once</span>
          <p className="lead small">{readOnceLine(r.readers)}</p>
        </section>
      )}
      <section className="card">
        <span className="label">What Biscuit says</span>
        {(r.lines || []).map((line, i) => <p key={i} className="lead small">{line}</p>)}
      </section>
      <section className="card facts">
        <span className="label">Each fact, over its quote</span>
        {r.facts.map((f, i) => <Fact key={i} f={f} readBy={r.readBy} />)}
      </section>
      <div className="spacer" />
      <button type="button" className="btn big" onClick={() => { stopSpeaking(); navigate(r.mismatch ? "/docket" : "/question"); }}>{r.mismatch ? "All right" : "Go on"}</button>
      <button type="button" className="btn secondary" onClick={() => { stopSpeaking(); navigate("/"); }}>Done</button>
      <p className="foot">{r.readBy === "twice" ? "Every number Biscuit said is inside a quote from the page, read the same way by two readers." : "Every number Biscuit said is inside a quote from the page."} The page's words stay on this phone.</p>
    </main>
  );
}

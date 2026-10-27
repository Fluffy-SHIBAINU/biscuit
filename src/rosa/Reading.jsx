import React, { useEffect } from "react";
import Dog from "../components/Dog.jsx";
import { navigate } from "../lib/navigate.js";
import { speak, stopSpeaking } from "../lib/speech.js";
import { useStore } from "../lib/store.js";

export const FIELD_LABEL = { sender: "From", hospital_name: "Hospital", amount_due: "Amount due", statement_date: "Statement date", due_date: "Due date", financial_assistance: "Financial assistance", phone_numbers: "Phone number", account_last4: "Account" };

export default function Reading() {
  const s = useStore();
  const r = s.lastReading;
  useEffect(() => {
    if (r?.lines?.length) speak(r.lines);
    return () => stopSpeaking();
  }, [r?.id]);
  if (!r) { navigate("/"); return null; }
  return (
    <main className="screen">
      <div className="row between"><span className="label">Biscuit reads it</span><a href="/" className="link" onClick={(e) => { e.preventDefault(); stopSpeaking(); navigate("/"); }}>Stop</a></div>
      <div className="row"><Dog size={56} /><h1 className="display small">{r.lines?.[0] || "Here's what it says."}</h1></div>
      <section className="card">
        <span className="label">What Biscuit says</span>
        {(r.lines || []).map((line, i) => <p key={i} className="lead small">{line}</p>)}
      </section>
      <section className="card facts">
        <span className="label">Each fact, over its quote</span>
        {r.facts.map((f, i) => (
          <div key={i} className={`fact ${f.verified ? "" : "unverified"}`}>
            <span className="label plain">{FIELD_LABEL[f.field] || f.field}</span>
            <strong>{f.value}</strong>
            {f.verified ? <span className="quote"><span className="mark">“{f.quote}”</span></span> : <span className="label plain">unverified, not spoken</span>}
          </div>
        ))}
      </section>
      <div className="spacer" />
      <button type="button" className="btn big" onClick={() => { stopSpeaking(); navigate("/question"); }}>Go on</button>
      <button type="button" className="btn secondary" onClick={() => { stopSpeaking(); navigate("/"); }}>Done</button>
      <p className="foot">Every number Biscuit said is inside a quote from the page. The page's words stay on this phone.</p>
    </main>
  );
}

import React from "react";
import { statusLine } from "../lib/letters.js";
import { navigate } from "../lib/navigate.js";
import { speak, stopSpeaking } from "../lib/speech.js";
import { useStore } from "../lib/store.js";

const KIND = { bill: "Bill", notice: "Notice", utility: "Utility", ad: "Ad", other: "Letter" };
const day = (iso) => new Date(iso).toLocaleDateString([], { month: "short", day: "numeric" });

export default function Docket() {
  const s = useStore();
  const letters = s.docket.filter((l) => l.status !== "hidden");
  const waiting = letters.filter((l) => l.status === "handoff" || l.status === "waiting_hospital").length;
  const readAll = () => speak(letters.length ? letters.map((l) => `${l.sender || "A letter"}. ${statusLine(l)}`) : ["Nothing on your papers yet."]);
  return (
    <main className="screen">
      <div className="row between"><span className="label">Your papers</span><a href="/" className="link" onClick={(e) => { e.preventDefault(); stopSpeaking(); navigate("/"); }}>Home</a></div>
      <h1 className="display small">{letters.length === 0 ? "Nothing yet." : `${letters.length === 1 ? "One thing" : `${letters.length} things`}.${waiting ? ` ${waiting === 1 ? "One is" : `${waiting} are`} waiting on an answer.` : ""}`}</h1>
      <section className="card facts">
        {letters.map((l) => (
          <div key={l.id} className="fact">
            <div className="row between"><span className={`pill ${l.status === "handoff" ? "signal" : l.status === "unknown_number" ? "bad" : "warn"}`}>{KIND[l.kind] || "Letter"}</span><span className="label plain">{day(l.readAt)}</span></div>
            <strong>{l.sender || "Unknown sender"}</strong>
            <span className="lead small">{statusLine(l)}</span>
          </div>
        ))}
      </section>
      <div className="spacer" />
      <button type="button" className="btn big" onClick={readAll}>Read them to me</button>
      <p className="foot">Dates come from your letters and from the hospital's written policy. Ana sees the same list.</p>
    </main>
  );
}

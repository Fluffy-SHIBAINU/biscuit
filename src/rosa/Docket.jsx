import React from "react";
import { statusLine } from "../lib/letters.js";
import { navigate } from "../lib/navigate.js";
import { speak, stopSpeaking } from "../lib/speech.js";
import { store, useStore } from "../lib/store.js";

const KIND = { bill: "Bill", notice: "Notice", utility: "Utility", ad: "Ad", other: "Letter" };
const day = (iso) => new Date(iso).toLocaleDateString([], { month: "short", day: "numeric" });

export default function Docket() {
  const s = useStore();
  const letters = s.docket.filter((l) => l.status !== "hidden");
  const waiting = letters.filter((l) => l.status === "handoff" || l.status === "waiting_hospital").length;
  const readAll = () => speak(letters.length ? letters.map((l) => `${l.sender || "A letter"}. ${statusLine(l)}`) : ["Nothing on your papers yet."]);
  // A tap on a letter plays its reading again; the spoken lines stayed with it on this phone.
  const replay = (l) => { stopSpeaking(); store.set({ lastReading: { ...l } }); navigate("/reading"); };
  return (
    <main className="screen">
      <div className="row between"><span className="label">Your Papers</span><a href="/" className="link" onClick={(e) => { e.preventDefault(); stopSpeaking(); navigate("/"); }}>Home</a></div>
      <h1 className="display small">{letters.length === 0 ? "Nothing yet." : `${letters.length === 1 ? "One thing" : `${letters.length} things`}.${waiting ? ` ${waiting === 1 ? "One is" : `${waiting} are`} waiting on an answer.` : ""}`}</h1>
      {letters.length > 0 && (
        <section className="card facts">
          {letters.map((l) => (
            <button key={l.id} type="button" className="fact as-button" onClick={() => replay(l)}>
              <div className="row between"><span className={`pill ${l.status === "handoff" ? "signal" : l.status === "unknown_number" ? "bad" : "warn"}`}>{KIND[l.kind] || "Letter"}</span><span className="label plain">{day(l.readAt)}</span></div>
              <strong>{l.sender || (l.status === "not_mine" ? "Someone else's letter" : "Unknown sender")}</strong>
              <span className="lead small">{statusLine(l)}</span>
            </button>
          ))}
          <p className="foot">Tap a letter to hear it again.</p>
        </section>
      )}
      <div className="spacer" />
      <button type="button" className="btn big" onClick={() => { stopSpeaking(); navigate("/letter"); }}>Show Me a Letter</button>
      {letters.length > 0 && <button type="button" className="btn secondary" onClick={readAll}>Read Them to Me</button>}
    </main>
  );
}

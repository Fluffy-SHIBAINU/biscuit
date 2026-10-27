import React from "react";
import Dog from "../components/Dog.jsx";
import { navigate } from "../lib/navigate.js";
import { useStore } from "../lib/store.js";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const clock = (d) => d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

export function greeting(now = new Date(), name = "Rosa") {
  const h = now.getHours();
  const part = h < 12 ? "morning" : h < 18 ? "afternoon" : "evening";
  return `Good ${part}, ${name}.`;
}

export default function Home() {
  const s = useStore();
  const now = new Date();
  const name = s.household?.called || "Rosa";
  const seen = s.lastMailSeen ? new Date(s.lastMailSeen) : null;
  const sameDay = seen && seen.toDateString() === now.toDateString();
  const waiting = s.docket.find((l) => l.status === "handoff" || l.status === "waiting_hospital");
  return (
    <main className="screen">
      <div className="row between"><span className="label">Biscuit · Kindred</span><span className="label plain">{DAYS[now.getDay()]} {clock(now)}</span></div>
      <div className="row"><Dog /><h1 className="display">{greeting(now, name)}</h1></div>
      <section className="card">
        <span className="label">Today's mail</span>
        <p className="lead">{sameDay ? `The mail came at ${clock(seen)}.` : "No mail seen yet today."}</p>
        <span className="label plain">Seen by the mailbox phone · no pictures kept</span>
        <a href="/mail" className="link" onClick={(e) => { e.preventDefault(); navigate("/mail"); }}>Mail came and I didn't say so? Tap here.</a>
      </section>
      <button type="button" className="btn big" onClick={() => navigate("/talk")}>Talk to Biscuit</button>
      <button type="button" className="btn secondary" onClick={() => navigate("/letter")}>Show me a letter</button>
      {s.consentedAt && <button type="button" className="btn danger" onClick={() => navigate("/help")}>Help <span className="hint">hold 2 s · calls 911, tells Ana</span></button>}
      <div className="spacer" />
      {waiting && (
        <section className="card">
          <span className="label">Waiting on</span>
          <p className="lead small">{waiting.waitingLine || `${waiting.sender}'s answer.`}</p>
        </section>
      )}
      <p className="foot">Biscuit is a computer helper from Kindred. Say <strong>stop</strong> and he stops.</p>
    </main>
  );
}

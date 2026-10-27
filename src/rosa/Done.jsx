import React, { useEffect } from "react";
import Dog from "../components/Dog.jsx";
import { navigate } from "../lib/navigate.js";
import { speak, stopSpeaking } from "../lib/speech.js";
import { useStore } from "../lib/store.js";

const clock = (iso) => (iso ? new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "");

export default function Done() {
  const s = useStore();
  const name = s.household?.called || "Rosa";
  useEffect(() => () => stopSpeaking(), []);
  const rows = [
    [`${name}'s phone linked to Ana`, "done"],
    [s.buttonsMode ? "Voice: using buttons for now" : `Voice: heard ${name}`, s.buttonsMode ? "later" : "done"],
    [`${name} said yes`, s.consentedAt ? `${clock(s.consentedAt)} · kept as the record of consent` : "not yet"],
    ["Help calls 911 and tells Ana", s.helpTested ? "test reached Ana's page" : "test not run yet"],
    ["Mail chime", s.pushSubscribed ? "on" : "turn it on from Home"],
  ];
  return (
    <main className="screen">
      <div className="row between"><span className="label">Set up for {name} · done</span><span className="label plain">{name}'s phone</span></div>
      <div className="row"><Dog size={64} /><h1 className="display small">Biscuit is ready.</h1></div>
      <section className="card facts">{rows.map(([t, d]) => <div key={t} className="fact"><strong>{t}</strong><span className="label plain">{d}</span></div>)}</section>
      <section className="card"><span className="label">Ana's page</span><p className="lead small">biscuit.kindred-ai.dev/ana · letters read, what Biscuit said, the mailbox phone, the Help status. Nothing goes to a hospital from there.</p></section>
      <div className="spacer" />
      <button type="button" className="btn big" onClick={async () => { await speak([`Hello, ${name}. I'm Biscuit. I speak up when the mail comes and when you ask. Say stop and I stop.`]); navigate("/"); }}>Let Biscuit say hello</button>
      <button type="button" className="btn secondary" onClick={() => navigate("/")}>Home</button>
    </main>
  );
}

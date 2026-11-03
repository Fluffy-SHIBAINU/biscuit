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
  return (
    <main className="screen">
      <div className="row between"><span className="label">Set Up · Done</span><span className="label plain">{name}'s phone</span></div>
      <div className="row"><Dog size={64} /><h1 className="display small">Biscuit Is Ready</h1></div>
      <section className="card facts">
        <div className="fact"><strong>Mail</strong><span className="lead small">He chimes when it comes and reads a letter when you show him.</span></div>
        <div className="fact"><strong>Talk</strong><span className="lead small">Just talk to him. Say stop and he stops.</span></div>
        <div className="fact"><strong>Help</strong><span className="lead small">Hold Help two seconds, or say Biscuit, help.</span></div>
        <div className="fact"><strong>Ana</strong><span className="lead small">Her page shows the letters he read and what he said.</span></div>
      </section>
      <div className="spacer" />
      <button type="button" className="btn big" onClick={async () => { await speak([`Hello, ${name}. I'm Biscuit. I read the mail, and you can just talk to me.`]); navigate("/"); }}>Let Biscuit Say Hello</button>
      <button type="button" className="btn secondary" onClick={() => navigate("/")}>Home</button>
    </main>
  );
}

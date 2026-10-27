import React, { useEffect, useRef } from "react";
import Dog from "../components/Dog.jsx";
import { postEvent, transcribe } from "../lib/api.js";
import { navigate } from "../lib/navigate.js";
import { listen, saidStop, speak, stopSpeaking } from "../lib/speech.js";
import { store, useStore } from "../lib/store.js";

const clock = (iso) => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

export default function Mail() {
  const s = useStore();
  const alive = useRef(true);
  const name = s.household?.called || "Rosa";
  const fromHome = new URLSearchParams(window.location.search).get("from") === "home";

  useEffect(() => {
    alive.current = true;
    if (fromHome) { store.set({ lastMailSeen: new Date().toISOString() }); postEvent("mail_tapped").catch(() => {}); }
    (async () => {
      await speak([`You've got mail, ${name}. Want me to look through it?`]);
      if (!alive.current || s.buttonsMode) return;
      try {
        const { blob, spoke } = await listen();
        const text = spoke ? await transcribe(blob) : "";
        if (!alive.current) return;
        if (saidStop(text)) { navigate("/"); return; }
        if (/\b(yes|yeah|yep|sure|please|okay|ok)\b/i.test(text)) navigate("/letter");
        else if (/\b(no|nope|not now|later)\b/i.test(text)) navigate("/");
      } catch { /* buttons remain */ }
    })();
    return () => { alive.current = false; stopSpeaking(); };
  }, []);

  return (
    <main className="screen">
      <div className="row between"><span className="label">Biscuit · Kindred</span><span className="label plain">{s.lastMailSeen ? clock(s.lastMailSeen) : ""}</span></div>
      <div className="row"><Dog /><h1 className="display">You've got mail, {name}.</h1></div>
      <section className="card">
        <span className="label">What Biscuit saw</span>
        <p className="lead">{s.lastMailSeen ? `The mailbox moved at ${clock(s.lastMailSeen)}.` : "The mail came."}</p>
        <span className="label plain">Mailbox phone on the sill · watches the box only · no pictures kept</span>
      </section>
      <p className="display small">Want me to look through it?</p>
      <button type="button" className="btn big" onClick={() => { stopSpeaking(); navigate("/letter"); }}>Yes, look</button>
      <button type="button" className="btn secondary" onClick={() => { stopSpeaking(); navigate("/"); }}>Not now</button>
      <div className="spacer" />
      <p className="foot">This opened from a notification you tapped. Biscuit speaks when the mail comes and when you ask. Nothing listens otherwise.</p>
    </main>
  );
}

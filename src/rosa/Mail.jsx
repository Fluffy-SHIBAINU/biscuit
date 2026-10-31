import React, { useEffect, useRef } from "react";
import Dog from "../components/Dog.jsx";
import { postEvent, transcribe } from "../lib/api.js";
import { navigate } from "../lib/navigate.js";
import { listen, speakAndKeep, stopSpeaking } from "../lib/speech.js";
import { releaseEar } from "../lib/ear.js";
import { handleVoiceCommand } from "../lib/commands.js";
import { mailTimeLabel } from "../lib/mailtime.js";
import { store, useStore } from "../lib/store.js";

const clock = (iso) => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

export default function Mail() {
  const s = useStore();
  const alive = useRef(true);
  const name = s.household?.called || "Rosa";
  const params = new URLSearchParams(window.location.search);
  const fromHome = params.get("from") === "home";
  // Opened from the delivery-hour chime: the hour is Ana's guess, not a sighting, and the words say so.
  const due = params.get("due") === "1";

  useEffect(() => {
    alive.current = true;
    if (fromHome) { store.set({ lastMailSeen: new Date().toISOString() }); postEvent("mail_tapped").catch(() => {}); }
    (async () => {
      await speakAndKeep([due ? `About now is when the mail usually comes, ${name}. Got a letter? Hold it up and I'll read it. Want me to look?` : `Woof! Mail's here, ${name}. Want me to take a look?`]);
      if (!alive.current || s.buttonsMode) return;
      try {
        const { blob, spoke } = await listen();
        const text = spoke ? await transcribe(blob) : "";
        if (!alive.current) return;
        if (handleVoiceCommand(text)) return;
        if (/\b(yes|yeah|yep|sure|please|okay|ok)\b/i.test(text)) navigate("/letter");
        else if (/\b(no|nope|not now|later)\b/i.test(text)) navigate("/");
      } catch { /* buttons remain */ }
    })();
    return () => { alive.current = false; stopSpeaking(); releaseEar(); };
  }, []);

  return (
    <main className="screen">
      <div className="row between"><span className="label">Biscuit · Kindred</span><span className="label plain">{s.lastMailSeen ? clock(s.lastMailSeen) : ""}</span></div>
      <div className="row"><Dog /><h1 className="display">{due ? `Mail time, ${name}!` : `Mail's here, ${name}!`}</h1></div>
      <section className="card">
        <span className="label">{due ? "What Biscuit Knows" : "What Biscuit Saw"}</span>
        <p className="lead">{due ? `The mail usually comes about ${s.mailMinutes != null ? mailTimeLabel(s.mailMinutes) : "now"}. Nobody has seen it yet today.` : s.lastMailSeen ? `The mailbox moved at ${clock(s.lastMailSeen)}.` : "The mail came."}</p>
      </section>
      <p className="display small">Want Me to Look Through It?</p>
      <button type="button" className="btn big" onClick={() => { stopSpeaking(); navigate("/letter"); }}>Yes, Look</button>
      <button type="button" className="btn secondary" onClick={() => { stopSpeaking(); navigate("/"); }}>Not Now</button>
      <div className="spacer" />
    </main>
  );
}

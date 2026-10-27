import React, { useEffect, useRef, useState } from "react";
import Dog from "../components/Dog.jsx";
import { transcribe } from "../lib/api.js";
import { navigate } from "../lib/navigate.js";
import { listen, saidStop, speak, stopSpeaking } from "../lib/speech.js";

export function replyTo(text) {
  const t = (text || "").trim();
  if (!t) return "I didn't catch that. Hold the phone closer and try again.";
  return `I heard: ${t.replace(/[.?!]+$/, "")}. I can read a letter if you show me one.`;
}

export default function Talk() {
  const [phase, setPhase] = useState("listening");
  const [heard, setHeard] = useState("");
  const [reply, setReply] = useState("");
  const [level, setLevel] = useState(0);
  const alive = useRef(true);

  async function turn() {
    setPhase("listening"); setHeard(""); setReply("");
    try {
      const { blob, spoke } = await listen({ onLevel: setLevel });
      if (!alive.current) return;
      setPhase("thinking");
      const text = spoke ? await transcribe(blob) : "";
      if (!alive.current) return;
      setHeard(text);
      if (saidStop(text)) { stopSpeaking(); navigate("/"); return; }
      const line = replyTo(text);
      setReply(line); setPhase("speaking");
      await speak([line]);
      if (alive.current) setPhase("done");
    } catch (err) {
      if (!alive.current) return;
      const line = err?.status === 401 ? "This phone isn't linked yet. Ask Ana." : "I couldn't hear you. Check the microphone and try again.";
      setReply(line); setPhase("done");
      await speak([line]);
    }
  }

  useEffect(() => { alive.current = true; turn(); return () => { alive.current = false; stopSpeaking(); }; }, []);

  return (
    <main className="screen">
      <div className="row between"><span className="label">Biscuit · Kindred</span><a href="/" className="link" onClick={(e) => { e.preventDefault(); stopSpeaking(); navigate("/"); }}>Stop</a></div>
      <div className="row"><Dog /><h1 className="display">{phase === "listening" ? "I'm listening." : phase === "thinking" ? "One moment." : "Here's what I heard."}</h1></div>
      {phase === "listening" && <div className="bars" aria-hidden="true">{[0, 1, 2, 3].map((i) => <span key={i} className={level ? "on" : ""} />)}</div>}
      {heard && <section className="card"><span className="label">You said</span><p className="lead quote">“{heard}”</p></section>}
      {reply && <section className="card"><span className="label">Biscuit says</span><p className="lead">{reply}</p></section>}
      <div className="spacer" />
      {phase === "done" && <button type="button" className="btn big" onClick={turn}>Talk again</button>}
      <button type="button" className="btn secondary" onClick={() => { stopSpeaking(); navigate("/"); }}>Done</button>
      <p className="foot">Biscuit listens only after you tap Talk. Your voice is turned into words and not kept.</p>
    </main>
  );
}

import React, { useEffect, useRef, useState } from "react";
import Dog from "../components/Dog.jsx";
import { transcribe } from "../lib/api.js";
import { navigate } from "../lib/navigate.js";
import { listen, speak, stopSpeaking } from "../lib/speech.js";
import { store, useStore } from "../lib/store.js";

export default function VoiceCheck() {
  const s = useStore();
  const name = s.household?.called || "Rosa";
  const [phase, setPhase] = useState("intro");
  const [heard, setHeard] = useState("");
  const [misses, setMisses] = useState(0);
  const alive = useRef(true);

  async function tryOnce() {
    setPhase("listening"); setHeard("");
    try {
      const { blob, spoke } = await listen();
      const text = spoke ? await transcribe(blob) : "";
      if (!alive.current) return;
      if (text.trim()) { setHeard(text); setPhase("heard"); await speak(["Heard. Was I loud enough?"]); }
      else miss();
    } catch { miss(); }
  }
  function miss() {
    const n = misses + 1;
    setMisses(n);
    if (n >= 3) { store.set({ buttonsMode: true }); setPhase("buttons"); speak(["We'll use the buttons instead. You can try your voice again later."]); }
    else { setPhase("miss"); speak(["I didn't catch that. Hold the phone closer and try again."]); }
  }
  useEffect(() => {
    alive.current = true;
    (async () => { await speak([`Hello ${name}. I'm Biscuit. Say: Hello Biscuit.`]); if (alive.current) tryOnce(); })();
    return () => { alive.current = false; stopSpeaking(); };
  }, []);

  const next = () => { stopSpeaking(); navigate("/setup/consent"); };
  return (
    <main className="screen">
      <div className="row between"><span className="label">Step 2 of 6 · voice check</span><span className="label plain">{name}'s phone</span></div>
      <div className="row"><Dog size={64} /><h1 className="display small">{phase === "heard" ? "Heard." : phase === "buttons" ? "We'll use buttons." : phase === "miss" ? "Not yet." : "Say: Hello Biscuit."}</h1></div>
      {phase === "listening" && <p className="lead small muted">Listening…</p>}
      {heard && <section className="card"><span className="label">Heard</span><p className="lead quote"><span className="mark">“{heard}”</span></p></section>}
      {phase === "miss" && <section className="card"><span className="label">Try {misses + 1} of 3</span><p className="lead small">Hold the phone closer. TV down. Wait for the chime, then speak.</p></section>}
      <div className="spacer" />
      {phase === "heard" && <><button type="button" className="btn big" onClick={next}>Just right</button><button type="button" className="btn secondary" onClick={() => { store.set((st) => ({ volumeStep: Math.min(2, (st.volumeStep || 0) + 1) })); speak(["Is this better?"]); }}>Louder</button><button type="button" className="btn secondary" onClick={tryOnce}>Say it again</button></>}
      {phase === "miss" && <><button type="button" className="btn big" onClick={tryOnce}>Try again</button><button type="button" className="btn secondary" onClick={() => { store.set({ buttonsMode: true }); next(); }}>Use buttons instead</button></>}
      {phase === "buttons" && <button type="button" className="btn big" onClick={next}>Go on</button>}
      <p className="foot">Your voice is turned into words and not kept. Three misses: buttons mode, and voice can be tried again later.</p>
    </main>
  );
}

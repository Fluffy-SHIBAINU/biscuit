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
      if (text.trim()) { setHeard(text); setPhase("heard"); await askLoud(); }
      else miss();
    } catch { miss(); }
  }

  /** Voice first: "Was I loud enough?" A "louder" turns him up and asks once more; a yes, anything else, or quiet moves on. */
  async function askLoud(again = false) {
    await speak([again ? "Is this better?" : "Heard you! Was I loud enough? Say yes, or say louder."]);
    if (!alive.current) return;
    let text = "";
    try { const { blob, spoke } = await listen(); text = spoke ? await transcribe(blob) : ""; } catch { /* the buttons remain */ }
    if (!alive.current) return;
    if (!again && /\b(louder|loud|turn (it )?up|more|can't hear|quiet|soft)\b/i.test(text)) { store.set((st) => ({ volumeStep: Math.min(2, (st.volumeStep || 0) + 1) })); await askLoud(true); return; }
    next();
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
      <div className="row between"><span className="label">Step 2 of 6 · Voice Check</span><span className="label plain">{name}'s phone</span></div>
      <div className="row"><Dog size={64} /><h1 className="display small">{phase === "heard" ? "Heard You!" : phase === "buttons" ? "We'll use buttons." : phase === "miss" ? "Not yet." : "Say: Hello Biscuit."}</h1></div>
      {phase === "listening" && <p className="lead small muted">Listening…</p>}
      {heard && <section className="card"><span className="label">Heard</span><p className="lead quote"><span className="mark">“{heard}”</span></p></section>}
      {phase === "miss" && <section className="card"><span className="label">Try {misses + 1} of 3</span><p className="lead small">Hold the phone closer. TV down. Wait for the chime, then speak.</p></section>}
      <div className="spacer" />
      {phase === "heard" && <><button type="button" className="btn big" onClick={next}>Just Right</button><button type="button" className="btn secondary" onClick={() => { store.set((st) => ({ volumeStep: Math.min(2, (st.volumeStep || 0) + 1) })); speak(["Is this better?"]); }}>Louder</button><button type="button" className="btn secondary" onClick={tryOnce}>Say It Again</button></>}
      {phase === "miss" && <><button type="button" className="btn big" onClick={tryOnce}>Try Again</button><button type="button" className="btn secondary" onClick={() => { store.set({ buttonsMode: true }); next(); }}>Use Buttons Instead</button></>}
      {phase === "buttons" && <button type="button" className="btn big" onClick={next}>Go On</button>}
    </main>
  );
}

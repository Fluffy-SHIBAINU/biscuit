import React, { useEffect, useRef, useState } from "react";
import Dog from "../components/Dog.jsx";
import { api, postEvent, transcribe } from "../lib/api.js";
import { navigate } from "../lib/navigate.js";
import { subscribePush } from "../lib/push.js";
import { listen, speak, stopSpeaking } from "../lib/speech.js";
import { saidHelp, saidStop } from "../lib/commands.js";
import { store, useStore } from "../lib/store.js";

export const CONSENT_TEXT = (name) => `I'm Biscuit. I speak up when the mail comes and when you ask. I read your letters out loud and keep a list of them on this phone. Ana sees what I read, unless you tell me not to share one. If you press Help, this phone calls 911 and Ana is told. Say stop and I stop. Shall I go on?`;

export default function Consent() {
  const s = useStore();
  const name = s.household?.called || "Rosa";
  const [share, setShare] = useState(s.household?.shareLetters !== false);
  const [paused, setPaused] = useState(false);
  const alive = useRef(true);

  async function yes() {
    stopSpeaking();
    const at = new Date().toISOString();
    store.set((st) => ({ consentedAt: at, household: { ...(st.household || {}), shareLetters: share } }));
    postEvent("consent").catch(() => {});
    if (!share) api("/household", { method: "PATCH", json: { shareLetters: false } }).catch(() => {});
    try { await subscribePush(); } catch { /* Home offers the chime again */ }
    navigate("/setup/help");
  }
  function no() { stopSpeaking(); setPaused(true); speak(["All right. Nothing is turned on. Ana can come back another day."]); }

  useEffect(() => {
    alive.current = true;
    (async () => {
      await speak([CONSENT_TEXT(name)]);
      if (!alive.current || s.buttonsMode) return;
      try {
        const { blob, spoke } = await listen();
        const text = spoke ? await transcribe(blob) : "";
        if (!alive.current) return;
        if (saidStop(text) || saidHelp(text) || /\b(no|nope|not now)\b/i.test(text)) no();
        else if (/\b(yes|yeah|yep|go on|okay|ok|sure)\b/i.test(text)) yes();
      } catch { /* buttons remain */ }
    })();
    return () => { alive.current = false; stopSpeaking(); };
  }, []);

  return (
    <main className="screen">
      <div className="row between"><span className="label">Step 3 of 6 · {name}'s yes</span><span className="label plain">{name}'s phone</span></div>
      <div className="row"><Dog size={64} /><h1 className="display small">{paused ? "Nothing is turned on." : "Biscuit reads this aloud."}</h1></div>
      <section className="card night"><p className="lead small">{CONSENT_TEXT(name)}</p></section>
      <label className="row toggle"><input type="checkbox" checked={share} onChange={(e) => setShare(e.target.checked)} /><span className="lead small">Ana may see the letters I read</span></label>
      <div className="spacer" />
      {!paused && <><button type="button" className="btn big" onClick={yes}>Yes, go on</button><button type="button" className="btn secondary" onClick={no}>No</button></>}
      {paused && <button type="button" className="btn secondary" onClick={() => setPaused(false)}>Ask me again</button>}
      <p className="foot">Only the time of {name}'s yes is kept. It is the only record of consent.</p>
    </main>
  );
}

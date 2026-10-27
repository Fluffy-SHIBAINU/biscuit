import React, { useState } from "react";
import { api } from "../lib/api.js";
import { navigate } from "../lib/navigate.js";
import { speak } from "../lib/speech.js";
import { store, useStore } from "../lib/store.js";

export default function SetupHelp({ onDone }) {
  const s = useStore();
  const [phone, setPhone] = useState(s.anaPhone || "");
  const [state, setState] = useState("idle");
  const name = s.household?.called || "Rosa";

  async function test() {
    setState("sending");
    try {
      const { eventId } = await api("/help/test", { method: "POST" });
      const started = Date.now();
      while (Date.now() - started < 30_000) {
        await new Promise((r) => setTimeout(r, 2500));
        const { acked } = await api(`/help/test/${eventId}`);
        if (acked) { setState("got"); store.set({ helpTested: true }); speak(["Ana's page got it."]); return; }
      }
      setState("missed");
    } catch { setState("missed"); }
  }

  const finish = () => { store.set({ anaPhone: phone.trim() || null }); onDone ? onDone() : navigate("/"); };

  return (
    <main className="screen">
      <div className="row between"><span className="label">Step 4 of 6 · Help</span><span className="label plain">{name}'s phone</span></div>
      <h1 className="display small">If {name} needs help.</h1>
      <div className="btn danger" style={{ height: 64, pointerEvents: "none" }}>Help</div>
      <span className="label plain center">On {name}'s home screen · hold 2 seconds, or say “Biscuit, help”</span>
      <section className="card">
        <span className="label">What happens</span>
        <div className="fact"><strong>1 · {name}'s phone calls 911</strong><span className="label plain">the phone's own emergency call · it asks “Call 911?” first, so a bump never dials</span></div>
        <div className="fact"><strong>2 · Ana is told at once</strong><span className="label plain">her page shows the time · her phone buzzes</span></div>
        <div className="fact"><strong>3 · Afterwards: Call Ana, or I'm OK</strong><label className="field"><span>Ana's number, kept on this phone only</span><input inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="617 555 0142" /></label></div>
      </section>
      {state === "got" && <section className="card status"><span className="pill ok">Got it</span><p className="lead small">Ana's page got the test. On a real Help her phone buzzes the same way.</p></section>}
      {state === "missed" && <section className="card status"><span className="pill warn">Not yet</span><p className="lead small">Ana's page didn't get it in 30 seconds. Ana: open biscuit.kindred-ai.dev/ana on your phone, tap Get notified, then try again. Help still calls 911 either way.</p></section>}
      <div className="spacer" />
      <button type="button" className="btn secondary" disabled={state === "sending"} onClick={test}>{state === "sending" ? "Sending…" : state === "missed" ? "Try again" : "Send a test to Ana's page"} <span className="hint">never dials</span></button>
      <button type="button" className="btn" onClick={finish}>{state === "got" ? "Next" : "Skip for now"}</button>
      <p className="foot">Biscuit opens the call; {name} taps Call. He never speaks on the line and never dials by himself.</p>
    </main>
  );
}

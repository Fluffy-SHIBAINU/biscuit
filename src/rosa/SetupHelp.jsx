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
      <div className="row between"><span className="label">Step 4 of 4 · Help</span><span className="label plain">{name}'s phone</span></div>
      <h1 className="display small">If {name} Needs Help</h1>
      <div className="btn danger" style={{ height: 76, pointerEvents: "none" }}>Help</div>
      <section className="card facts">
        <div className="fact"><strong>Hold It Two Seconds</strong><span className="lead small">{name}'s phone calls 911. It asks first, so a bump never dials.</span></div>
        <div className="fact"><strong>Ana Is Told at Once</strong><span className="lead small">Her phone buzzes and her page shows the time.</span></div>
        <div className="fact"><strong>Afterwards</strong><span className="lead small">Call Ana, or I'm OK.</span><label className="field"><span>Ana's Number</span><input inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="617 555 0100" /></label></div>
      </section>
      {state === "got" && <section className="card status"><span className="pill ok">Got It</span><p className="lead small">Ana's page got the test.</p></section>}
      {state === "missed" && <section className="card status"><span className="pill warn">Not Yet</span><p className="lead small">Ana's page didn't answer in thirty seconds. Ana can tap Get Notified on This Device on her page, then try again.</p></section>}
      <div className="spacer" />
      <button type="button" className="btn secondary" disabled={state === "sending"} onClick={test}>{state === "sending" ? "Sending…" : state === "missed" ? "Try Again" : "Send a Test to Ana's Page"}</button>
      <button type="button" className="btn" onClick={finish}>{state === "got" ? "Next" : "Skip for Now"}</button>
    </main>
  );
}

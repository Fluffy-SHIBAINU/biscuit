import React, { useState } from "react";
import { api } from "../lib/api.js";
import { navigate } from "../lib/navigate.js";
import { speak } from "../lib/speech.js";
import { store, useStore } from "../lib/store.js";

export default function Settings() {
  const s = useStore();
  const [arm, setArm] = useState(false);
  const [busy, setBusy] = useState(false);
  async function wipe() {
    setBusy(true);
    try { await api("/household", { method: "DELETE" }); } catch { /* the phone is wiped either way */ }
    store.clear();
    await speak(["Everything is deleted."]);
    navigate("/");
  }
  return (
    <main className="screen">
      <div className="row between"><span className="label">Settings</span><a href="/" className="link" onClick={(e) => { e.preventDefault(); navigate("/"); }}>Home</a></div>
      <h1 className="display small">Biscuit on this phone.</h1>
      <section className="card facts">
        <div className="fact"><strong>Voice</strong><span className="label plain">{s.buttonsMode ? "buttons mode" : "on"}</span>{s.buttonsMode && <button type="button" className="btn secondary" onClick={() => store.set({ buttonsMode: false })}>Try voice again</button>}</div>
        <div className="fact"><strong>Mail chime</strong><span className="label plain">{s.pushSubscribed ? "on" : "off · turn it on from Home"}</span></div>
        <div className="fact"><strong>Sharing with Ana</strong><span className="label plain">{s.household?.shareLetters === false ? "off" : "on"}</span></div>
      </section>
      <div className="spacer" />
      {!arm ? <button type="button" className="btn danger" onClick={() => { setArm(true); speak(["Delete everything? This cannot be undone. Tap Yes, delete, or say nothing."]); }}>Delete everything</button>
        : <><button type="button" className="btn danger" disabled={busy} onClick={wipe}>Yes, delete</button><button type="button" className="btn secondary" onClick={() => setArm(false)}>Keep it</button></>}
      <p className="foot">Delete removes the list on this phone and everything Biscuit kept for Ana's page. Nothing stays but a count of deletions.</p>
    </main>
  );
}
